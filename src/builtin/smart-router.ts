/**
 * PiPal-A2A Builtin — Smart Router
 *
 * karpathy-clean-code: Router is infrastructure, not core.
 * Config activates, not defines.
 *
 * Routes tasks by matching task text keywords against agent's skill.tags[].
 * Skill IDs are install-specific; tags are semantic and universal.
 *
 * Example:
 *   Agent has skill: { id: "backend-implementation-01", tags: ["node.js", "express"] }
 *   Task text: "build a node.js server"
 *   → Router matches "node.js" against tags → routes to this agent ✅
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { RoutingStrategy } from "../sdk/index.js";
import type { Task, AgentCard } from "../core/types.js";

interface TeamRole {
  name: string;
  description: string;
  skills: string[];
  escalatesTo: string[];
  handlesDirectly: string[];
}

interface TeamConfig {
  team: {
    roles: Record<string, TeamRole>;
  };
}

export class SmartRouter implements RoutingStrategy {
  readonly priority = 80; // Higher than SkillMatcher (50)
  private config: TeamConfig | null = null;
  private configPath = join(process.cwd(), "config", "team.yaml");

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (existsSync(this.configPath)) {
        const yaml = readFileSync(this.configPath, "utf-8");
        this.config = this.parseYaml(yaml);
        console.log("[SmartRouter] Loaded config/team.yaml");
      } else {
        console.warn("[SmartRouter] No config/team.yaml — using pure tag-based routing");
        this.config = null;
      }
    } catch (err) {
      console.warn("[SmartRouter] Failed to load config/team.yaml:", err);
      this.config = null;
    }
  }

  /**
   * Parse minimal YAML (no external deps — built-in parsing)
   */
  private parseYaml(yaml: string): TeamConfig {
    const config: TeamConfig = { team: { roles: {} } };
    const lines = yaml.split("\n");

    let currentRole: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Top-level "team:"
      if (trimmed === "team:") continue;

      // Role definition: "  backend:"
      const roleIndent = line.match(/^(\s*)(\w+):/);
      if (roleIndent && roleIndent[1].length === 2) {
        currentRole = roleIndent[2];
        if (!config.team.roles[currentRole]) {
          config.team.roles[currentRole] = {
            name: currentRole,
            description: "",
            skills: [],
            escalatesTo: [],
            handlesDirectly: [],
          };
        }
        continue;
      }

      if (!currentRole) continue;

      // Key: value or Key: [items]
      const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (!kvMatch) continue;

      const [, key, rawVal] = kvMatch;
      const val = rawVal.trim().replace(/,$/, "");

      if (key === "description") {
        config.team.roles[currentRole].description = val.replace(/['"]/g, "");
      } else if (key === "escalatesTo") {
        if (val.startsWith("[") && val.endsWith("]")) {
          config.team.roles[currentRole].escalatesTo = this.parseArray(val);
        }
      } else if (key === "handlesDirectly") {
        if (val.startsWith("[") && val.endsWith("]")) {
          config.team.roles[currentRole].handlesDirectly = this.parseArray(val);
        }
      } else if (key === "skills") {
        if (val.startsWith("[") && val.endsWith("]")) {
          config.team.roles[currentRole].skills = this.parseArray(val);
        }
      }
    }

    return config;
  }

  private parseArray(val: string): string[] {
    return val
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
  }

  /**
   * Select best agent for a task by matching task text keywords
   * against each agent's declared skill.tags[].
   */
  select(task: Task, candidates: AgentCard[]): AgentCard | undefined {
    if (candidates.length === 0) return undefined;

    // Explicit hints from task metadata — highest priority
    const toHint = task.metadata?.["to"] as string | undefined;
    const skillHint = task.metadata?.["skill"] as string | undefined;

    if (toHint) {
      const match = candidates.find((a) => a.name === toHint);
      if (match) return match;
    }

    if (skillHint) {
      const match = candidates.find((a) =>
        a.skills.some((s) => s.id === skillHint)
      );
      if (match) return match;
    }

    // Tag-based routing — extract keywords from task text
    const keywords = this.extractKeywords(task);
    if (keywords.length > 0) {
      for (const keyword of keywords) {
        for (const agent of candidates) {
          if (this.agentHasTag(agent, keyword)) {
            console.log(`[SmartRouter] Tag match: "${keyword}" → ${agent.name}`);
            return agent;
          }
        }
      }
    }

    // Fallback: first available candidate
    return candidates[0];
  }

  /**
   * Extract meaningful keywords from task text.
   * Filters stopwords, keeps technical terms and action words.
   */
  private extractKeywords(task: Task): string[] {
    // Collect all text from task history
    let text = "";
    for (const msg of task.history || []) {
      for (const part of msg.parts || []) {
        if ("text" in part && part.text) text += part.text + " ";
      }
    }

    // Remove common stopwords
    const stopwords = new Set([
      "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "can", "to", "of", "in", "for", "on",
      "with", "at", "by", "from", "as", "or", "and", "but", "if", "then",
      "so", "not", "this", "that", "these", "those", "i", "you", "we",
      "they", "it", "my", "your", "our", "their", "build", "create",
      "please", "need", "want", "task", "delegated", "from",
    ]);

    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w));

    // Return unique technical terms (2+ words can be matched too)
    // Prefer longer/more specific terms
    const seen = new Set<string>();
    const keywords: string[] = [];

    // First pass: look for compound terms (e.g., "node.js", "rest api")
    const compound = text.toLowerCase().match(/(node\.js|express\.js|rest\.api|graphql|postgresql|mongodb|react\.js|vue\.js|next\.js|tailwindcss?|typescript|python|django|flask|golang|rust|docker|kubernetes|jwt|oauth)/g);

    if (compound) {
      for (const c of compound) {
        if (!seen.has(c)) {
          seen.add(c);
          keywords.push(c);
        }
      }
    }

    // Second pass: unique technical words
    for (const w of words) {
      if (!seen.has(w) && /^[a-z0-9.-]+$/.test(w)) {
        seen.add(w);
        keywords.push(w);
      }
    }

    return keywords;
  }

  /**
   * Check if agent has a skill tag matching the keyword
   */
  private agentHasTag(agent: AgentCard, keyword: string): boolean {
    const kw = keyword.toLowerCase();

    for (const skill of agent.skills) {
      // Check skill.tags (explicit keywords) — most specific match
      if (skill.tags?.some((tag) => tag.toLowerCase() === kw || tag.toLowerCase().includes(kw) || kw.includes(tag.toLowerCase()))) {
        return true;
      }
      // Check skill.name partial match
      if (skill.name?.toLowerCase().includes(kw) && kw.length > 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if this role should handle the task without delegating
   */
  shouldHandleDirectly(roleName: string, taskText: string): boolean {
    if (!this.config) return false;

    const role = this.config.team.roles[roleName];
    if (!role) return false;

    const lower = taskText.toLowerCase();
    return role.handlesDirectly.some((h) => lower.includes(h.toLowerCase()));
  }

  /**
   * Get escalation targets for a role
   */
  getEscalationTargets(roleName: string): string[] {
    if (!this.config) return [];
    return this.config.team.roles[roleName]?.escalatesTo || [];
  }
}