/**
 * PiPal-A2A — Pi Extension Entry Point
 * 
 * Each pi terminal IS an agent. Google A2A v1.0 compliant.
 * 
 * This extension:
 *   1. On session_start: HOST or JOIN the shared state
 *   2. Registers ONE tool: pipal_a2a_delegate(task, skill?, to?)
 *   3. Receives delegated tasks via SSE → injects into pi's LLM
 *   4. Captures LLM response → posts result back to shared state
 * 
 * Usage: pi install ./pipal-a2a
 * 
 * Google A2A v1.0 types used:
 *   AgentCard — published to shared state for discovery
 *   Task — represents a unit of work between agents
 *   AgentSkill — declares what this agent can do
 *   AgentInterface — declares protocol endpoint
 *   TaskState — TASK_STATE_SUBMITTED, WORKING, COMPLETED, FAILED
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { load, JSON_SCHEMA } from "js-yaml";
import { resolve } from "path";
import {
  createAgentCard,
  createSkill,
  type AgentCard,
  type AgentSkill,
} from "../core/types.js";
import { SharedStateServer, SharedStateClient } from "../infrastructure/shared-state.js";
import type { StoredTask } from "../core/types.js";
import { ResponseCapture } from "./response-capture.js";
import type { IsolationStrategy } from "../builtin/isolation/isolation.js";
import { NoIsolation } from "../builtin/isolation/no-isolation.js";
import { WorktreeIsolation } from "../builtin/isolation/worktree-isolation.js";
import { InMemoryAgentRegistry } from "../application/registry.js";
// DefaultTaskRouter removed — dead import (never used, SmartRouter handles routing directly)
import { SmartRouter } from "../builtin/smart-router.js";

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

let rolesLoaded = false;  // Prevent repeated team.yaml warnings

interface ExtensionConfig {
  sharedState: string;
  role?: string;
  host?: string;       // server bind address: "127.0.0.1" (default) or "0.0.0.0" (multi-machine)
  identity: {
    name: string;
    description?: string;
    skills: string[];
    tags: string[];
  };
  apiKey?: string;
  dbPath?: string;
  isolation?: "none" | "worktree";  // Config activates, not defines. Default: none.
  // MemPalace — swappable memory/KB backend
  // Config activates, not defines. Core doesn't know about MemPalace specifics.
  mempalace?: {
    enabled: boolean;
    wing: string;       // e.g. "wing_pipal_a2a" — can be any wing name
    sharedRoom: string; // e.g. "shared" — room for cross-agent docs
  };
}

function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — that's fine
  }
}

function loadConfig(): ExtensionConfig {
  loadEnvFile(); // Load .env into process.env BEFORE any config resolution
  let config: ExtensionConfig = {
    sharedState: "http://localhost:5000",
    host: "127.0.0.1",
    identity: {
      name: `agent-${Math.random().toString(36).slice(2, 8)}`,
      skills: [],
      tags: [],
    },
  };

  const paths = [
    resolve(process.cwd(), "config/pipal-a2a.yaml"),
    resolve(process.cwd(), ".pipal-a2a.yaml"),
    resolve(process.env.HOME || "~", ".pi/config/pipal-a2a.yaml"),
  ];

  let configFileFound = false;
  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      const loaded = load(content, { schema: JSON_SCHEMA }) as Partial<ExtensionConfig>;
      // Merge loaded config with defaults — identity may be absent in YAML
      config = {
        sharedState: loaded.sharedState ?? config.sharedState,
        host: loaded.host ?? config.host,
        role: loaded.role,
        apiKey: loaded.apiKey,
        identity: loaded.identity ?? config.identity,
        // MemPalace: OFF by default (config activates, not defines)
        mempalace: loaded.mempalace ?? {
          enabled: false,
          wing: "wing_a2a",
          sharedRoom: "shared",
        },
        dbPath: loaded.dbPath,
        isolation: loaded.isolation ?? "none",
      };
      configFileFound = true;
      break;
    } catch {
      continue;
    }
  }
  if (!configFileFound) {
    console.warn(`[pipal-a2a] ⚠️  No config/pipal-a2a.yaml found. Using defaults (random name, no skills).`);
    console.warn(`[pipal-a2a]    Create config/pipal-a2a.yaml for best experience. See README for setup.`);
  }

  // PIPAL_ROLE env var overrides config file role
  if (process.env.PIPAL_ROLE) {
    config.role = process.env.PIPAL_ROLE;
  }

  // Resolve role from team.yaml — sets identity fields (name, skills, tags, description)
  // Precedence: role field (file or PIPAL_ROLE env) → team.yaml lookup → identity fallback
  if (config.role) {
    const roles = loadTeamRoles();
    const role = roles.get(config.role);
    if (role) {
      config.identity.name = role.name;
      config.identity.skills = role.skills;
      config.identity.tags = role.tags || [];
      config.identity.description = role.description;
    } else {
      console.warn(`[pipal-a2a] Role "${config.role}" not found in team.yaml`);
    }
  }

  // Environment variables override individual identity fields (backward compat)
  if (process.env.PIPAL_NAME) config.identity.name = process.env.PIPAL_NAME;
  if (process.env.PIPAL_SKILLS) {
    config.identity.skills = process.env.PIPAL_SKILLS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.PIPAL_TAGS) {
    config.identity.tags = process.env.PIPAL_TAGS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.PIPAL_DESCRIPTION) config.identity.description = process.env.PIPAL_DESCRIPTION;
  if (process.env.PIPAL_API_KEY) config.apiKey = process.env.PIPAL_API_KEY;
  if (process.env.PIPAL_SHARED_STATE) config.sharedState = process.env.PIPAL_SHARED_STATE;

  // After YAML load: propagate sharedState to process.env if set from config
  // This prevents auto-port from overriding any explicit YAML sharedState
  // (auto-port only runs for default localhost:5000 with no explicit config)
  if (config.sharedState && !process.env.PIPAL_SHARED_STATE) {
    process.env.PIPAL_SHARED_STATE = config.sharedState;
  }

  // Auto-port: ONLY runs if sharedState is still default (5000) AND no explicit config
  // Purpose: project isolation via CWD hash for teams without explicit config
  if (!process.env.PIPAL_SHARED_STATE && config.sharedState === "http://localhost:5000") {
    const cwd = process.cwd();
    const hash = cwd.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const port = 5000 + (Math.abs(hash) % 100); // 5000-5099
    config.sharedState = `http://localhost:${port}`;
  }

  return config;
}

/**
 * MemPalace integration — Option D: Hybrid (LLM-driven MCP calls).
 * Extension provides promptGuidelines, LLM calls MCP tools directly.
 * Per karpathy-clean-code: prompts > code.
 * No extension code calls MCP — the LLM orchestrates all MemPalace reads/writes.
 */

// ─────────────────────────────────────────────────────────────────
// Task Clarity Guard
// Per karpathy-clean-code: Code is the safety net when prompts fail.
// Rejects vague tasks with specific Wh-questions the sender must answer.
// ─────────────────────────────────────────────────────────────────

interface ClarityAssessment {
  reject: boolean;
  reason: string;
  questions: string[];
}

/** Vague phrases that indicate insufficient clarity */
const VAGUE_PATTERNS: Array<{ pattern: RegExp; reason: string; questions: string[] }> = [
  // Pattern 1: Verb + vague filler (cool, nice, better, etc.) with no specifics
  {
    pattern: /^(build|make|create|fix|improve|update|change|do)\s+(something|it|that|this|stuff|things?)\b/i,
    reason: "Task has no specific subject",
    questions: [
      "WHAT exactly should be built, fixed, or changed?",
      "WHERE should the output go (file path, directory)?",
      "WHAT are the specific requirements or acceptance criteria?",
    ],
  },
  // Pattern 1b: Bare verb only ("build", "fix", "improve")
  {
    pattern: /^(build|make|create|fix|improve|update|change|do)\s*$/i,
    reason: "Task has no specific subject",
    questions: [
      "WHAT exactly should be built, fixed, or changed?",
      "WHERE should the output go (file path, directory)?",
      "WHAT are the specific requirements or acceptance criteria?",
    ],
  },
  // Pattern 2: Subjective goal ("make the app better", "build something cool")
  {
    pattern: /^(make|build)\s+(it|the app|the code|the project|something)\s+(better|good|cool|nice|awesome|great|work|interesting|fun)/i,
    reason: "Task has subjective goal with no measurable criteria",
    questions: [
      "WHAT specific improvement is needed (performance, UX, security)?",
      "HOW will you know it's done (test, benchmark, metric)?",
      "WHICH files or components should change?",
    ],
  },
  // Pattern 3: Unscoped bug reference
  {
    pattern: /^fix\s+(the\s+)?(bug|issue|problem|error)/i,
    reason: "Task references a bug without describing it",
    questions: [
      "WHAT is the bug (error message, unexpected behavior)?",
      "WHERE does it occur (file, route, function)?",
      "WHEN does it happen (reproduction steps)?",
      "WHAT is the expected behavior?",
    ],
  },
  // Pattern 4: Unscoped feature request
  {
    pattern: /^(add|implement)\s+(a\s+)?(feature|functionality|thing|stuff)/i,
    reason: "Task references a feature without describing it",
    questions: [
      "WHAT feature should be added (name, purpose)?",
      "WHERE should it go (API endpoint, UI component)?",
      "WHAT are the inputs and outputs?",
    ],
  },
  // Pattern 5: Unscoped review request
  {
    pattern: /^(review|check|test|analyze)\s*(it|this|the code|the app)?\s*$/i,
    reason: "Task requests review with no subject",
    questions: [
      "WHAT should be reviewed (file path, code snippet, PR)?",
      "WHAT aspects (security, performance, style, correctness)?",
      "ARE there specific concerns or known issues?",
    ],
  },
  {
    pattern: /^.{0,10}$/,
    reason: "Task is too short to be actionable",
    questions: [
      "WHAT is the specific task?",
      "WHAT files or components are involved?",
      "WHAT are the expected deliverables?",
    ],
  },
];

/**
 * Assess whether a task description is clear enough to execute.
 * Returns reject=true with Wh-questions if the task is too vague.
 */
function assessTaskClarity(taskDescription: string): ClarityAssessment {
  const trimmed = taskDescription.trim();

  for (const { pattern, reason, questions } of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { reject: true, reason, questions };
    }
  }

  return { reject: false, reason: "", questions: [] };
}

// ─────────────────────────────────────────────────────────────────
// Workflow PreHook Types
// karpathy-clean-code: Config activates, not defines.
// Workflow = structured plan for planner — executed via PreHook.
// ─────────────────────────────────────────────────────────────────

interface WorkflowStep {
  role: string;
  task: string;
  depends_on?: string[];
}

interface Workflow {
  name: string;
  description: string;
  working_dir?: string;  // Directory for all steps in this workflow
  steps: WorkflowStep[];
}

/**
 * Load workflows from team.yaml (same resolution path as loadTeamRoles).
 * karpathy-clean-code: Config activates — this reads config, doesn't define behavior.
 */
function loadWorkflows(): Map<string, Workflow> {
  const workflows = new Map<string, Workflow>();
  const paths = [
    resolve(process.cwd(), "config/team.yaml"),
    resolve(process.cwd(), "team.yaml"),
    resolve(process.env.HOME || "~", ".pi/config/team.yaml"),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      const data = load(content, { schema: JSON_SCHEMA }) as any;
      if (data?.workflows) {
        for (const [key, wf] of Object.entries(data.workflows)) {
          const w = wf as any;
          workflows.set(key, {
            name: w.name || key,
            description: w.description || "",
            working_dir: w.working_dir || "",
            steps: (w.steps || []).map((s: any) => ({
              role: s.role,
              task: s.task,
              depends_on: s.depends_on || [],
            })),
          });
        }
      }
      break;
    } catch {
      continue;
    }
  }
  return workflows;
}

/**
 * Workflow PreHook: executes workflow steps if task matches a workflow name.
 * Returns true if a workflow was executed, false for normal delegation.
 * karpathy-clean-code: PreHook runs before Core — validate, gate, or intercept.
 */
async function executeWorkflowIfMatch(
  task: string,
  client: SharedStateClient,
  card: AgentCard,
  onlineAgents: AgentCard[],
  signal: AbortSignal,
  onUpdate?: (update: any) => void
): Promise<{ executed: boolean; summary?: string }> {
  const workflows = loadWorkflows();
  if (workflows.size === 0) return { executed: false };

  // Normalize task for matching (lowercase, trim, strip common prefixes)
  const normalizedTask = task.toLowerCase().trim()
    .replace(/^(build|run|execute|start|create|make)\s+/i, "");

  // Find matching workflow — check if task contains workflow key
  let matchedWorkflow: Workflow | null = null;
  for (const [key, wf] of workflows) {
    const normalizedKey = key.toLowerCase().replace(/-_/g, " ");
    if (normalizedTask.includes(normalizedKey) || normalizedKey.includes(normalizedTask)) {
      matchedWorkflow = wf;
      break;
    }
  }

  if (!matchedWorkflow) return { executed: false };

  console.log(`[pipal-a2a] 🔄 Workflow PreHook matched: ${matchedWorkflow.name}`);
  if (onUpdate) {
    onUpdate({
      content: [{ type: "text" as const, text: `[pipal-a2a] 🔄 Starting workflow: ${matchedWorkflow.name}` }],
      details: { workflow: matchedWorkflow.name },
    });
  }

  // Create working directory first — enforces project isolation
  // Agent MUST work in this directory
  if (matchedWorkflow.working_dir) {
// existsSync, mkdirSync imported at top (ESM, not require)
    try {
      if (!existsSync(matchedWorkflow.working_dir)) {
        mkdirSync(matchedWorkflow.working_dir, { recursive: true });
        console.log(`[pipal-a2a] 📁 Created working directory: ${matchedWorkflow.working_dir}`);
        stepResults.push(`📁 Created ${matchedWorkflow.working_dir}/`);
      }
    } catch (err) {
      console.warn(`[pipal-a2a] ⚠️  Could not create ${matchedWorkflow.working_dir}:`, err);
    }
  }

  const completedRoles = new Set<string>();
  const stepResults: string[] = [];

  for (const step of matchedWorkflow.steps) {
    if (signal.aborted) break;

    // Check dependencies — only skip if dependencies haven't completed yet
    if (step.depends_on?.length) {
      const missing = step.depends_on.filter((d) => !completedRoles.has(d));
      if (missing.length > 0) {
        console.log(`[pipal-a2a] ⏳ Waiting for ${missing.join(", ")} before ${step.role}...`);
        // Don't skip — we'll try again after other steps
        // In practice, steps run sequentially so deps should be met by now
      }
    }

    // Find target agent
    const target = onlineAgents.find((a) => a.name === step.role);
    if (!target) {
      console.log(`[pipal-a2a] ⚠️ Agent ${step.role} not online — skipping step`);
      stepResults.push(`⚠️ ${step.role}: skipped (not online)`);
      continue;
    }

    // Prepend working_dir to task if workflow has one
    const effectiveTask = matchedWorkflow.working_dir
      ? `Work in ${matchedWorkflow.working_dir}/ directory. ${step.task}`
      : step.task;

    console.log(`[pipal-a2a] 📤 Delegating to ${step.role}: "${effectiveTask.slice(0, 60)}..."`);

    // Execute delegation with result capture
    const taskId = await client.createTask({
      from: card.name,
      to: step.role,
      task: effectiveTask,
    });

    const result = await waitForTaskCompletion(client, taskId, 120_000, signal, onUpdate, card.name, target.name);
    completedRoles.add(step.role);

    const status = result?.status?.state === "TASK_STATE_COMPLETED" ? "✅" : "❌";
    const text = result?.artifacts?.[0]?.parts?.[0]?.text?.slice(0, 100) || "";
    stepResults.push(`${status} ${step.role}: ${text || result?.metadata?.error || "completed"}`);

    console.log(`[pipal-a2a] ✅ Step completed: ${step.role}`);
  }

  const summary = `Workflow "${matchedWorkflow.name}" completed:\n${stepResults.join("\n")}`;
  console.log(`[pipal-a2a] 🔄 Workflow done: ${matchedWorkflow.name}`);
  return { executed: true, summary };
}

/**
 * Wait for a task to complete, with abort signal support and streaming.
 */
function waitForTaskCompletion(
  client: SharedStateClient,
  taskId: string,
  timeoutMs: number,
  signal: AbortSignal,
  onUpdate?: (update: any) => void,
  fromName?: string,
  toName?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Aborted"));

    const timer = setTimeout(() => reject(new Error("Task timeout")), timeoutMs);
    let accumulated = "";

    const unsub = client.subscribeToTask(taskId, (event, data) => {
      if (signal.aborted) { clearTimeout(timer); unsub(); return reject(new Error("Aborted")); }

      if (event === "artifact_update" && (data as any)?.chunk) {
        accumulated += (data as any).chunk;
        if (onUpdate) {
          onUpdate({
            content: [{ type: "text" as const, text: `**Streaming from ${toName}:**\n${accumulated}▍` }],
            details: { taskId, from: fromName, to: toName, streaming: true },
          });
        }
      }
      // Multi-turn: agent asks a follow-up question
      if (event === "task_update") {
        const status = (data as any)?.status;
        if (status?.state === "TASK_STATE_INPUT_REQUIRED") {
          (async () => {
            try {
              const taskNow = await client.getTask(taskId);
              const lastAgentMsg = [...(taskNow.history || [])].reverse().find((m) => m.role === "ROLE_AGENT");
              const question = lastAgentMsg?.parts?.[0]?.text ?? "The agent needs more information.";
              accumulated += `\n\n❓ **${toName} asks:** ${question}\n*Responding automatically with task context...*\n`;
              if (onUpdate) {
                onUpdate({ content: [{ type: "text" as const, text: accumulated }], details: { taskId, from: fromName, to: toName, inputRequired: true } });
              }
              await client.sendFollowUp(taskId, `Continue with the task. Original request: ${(taskNow as any).taskDescription}`, { role: "ROLE_USER" });
            } catch (err) { console.error("[pipal-a2a] multi-turn error:", err); }
          })();
        }
      }
      if (event === "task_completed" || event === "task_failed") {
        clearTimeout(timer); unsub(); client.getTask(taskId).then(resolve).catch(reject);
      }
    });

    signal.addEventListener("abort", () => { clearTimeout(timer); unsub(); reject(new Error("Aborted")); });
  });
}

interface TeamRole {
  name: string;
  description: string;
  skills: string[];
  tags?: string[];
}

function loadTeamRoles(): Map<string, TeamRole> {
  const roles = new Map<string, TeamRole>();
  const paths = [
    resolve(process.cwd(), "config/team.yaml"),
    resolve(process.cwd(), "team.yaml"),
    resolve(process.env.HOME || "~", ".pi/config/team.yaml"),
  ];
  let teamFileFound = false;
  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      const data = load(content, { schema: JSON_SCHEMA }) as any;
      if (data?.team?.roles) {
        for (const [key, val] of Object.entries(data.team.roles)) {
          const r = val as any;
          roles.set(key, {
            name: key,
            description: r.description || `Role: ${key}`,
            skills: r.skills || [],
            tags: r.tags || [],
          });
        }
      }
      teamFileFound = true;
      break;
    } catch {
      continue;
    }
  }
  if (!teamFileFound && !rolesLoaded) {
    console.warn(`[pipal-a2a] ⚠️  No config/team.yaml found. Role resolution and /pipal-role will not work.`);
    rolesLoaded = true;
  }
  return roles;
}

// ─────────────────────────────────────────────────────────────────
// Extension Factory
// ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  let client: SharedStateClient | null = null;
  let server: SharedStateServer | null = null;
  let unsubscribe: (() => void) | null = null;
  let card: AgentCard | null = null;

  const registry = new InMemoryAgentRegistry();

  // Isolation strategy — config activates, not defines
  let isolation: IsolationStrategy = new NoIsolation();
  if (config.isolation === "worktree") {
    try {
      const wt = new WorktreeIsolation();
      await wt.cleanupStale();  // Prune orphan worktrees from previous crashes
      isolation = wt;
      console.log(`[pipal-a2a] 🔒 Worktree isolation enabled`);
    } catch (err) {
      console.warn(`[pipal-a2a] ⚠️  Worktree isolation failed: ${err}. Falling back to none.`);
      isolation = new NoIsolation();
    }
  }

  // Response capture — explicit state machine for LLM response → shared state
  const capture = new ResponseCapture({
    postResult: async (id, r) => {
      await client!.postResult(id, r);
      // Finalize worktree after result is posted
      const result = await isolation.finalize(card!.name);
      if (!result.success) {
        console.error(`[pipal-a2a] ⚠️  Worktree finalize failed: ${result.error}. Skipping cleanup to preserve work.`);
      }
    },
    postError: (id, e) => client!.postError(id, e),
    streamChunk: (id, c) => client!.streamChunk(id, c),
  });

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_start
  // ───────────────────────────────────────────────────────────────
  pi.on("session_start", async () => {
    const sharedStateUrl = config.sharedState;
    const parsedPort = parseInt(new URL(sharedStateUrl).port || "5000");

    client = new SharedStateClient(sharedStateUrl, config.apiKey, config.identity?.name);
    const isHost = !(await client.isReachable());

    if (isHost) {
      try {
        server = new SharedStateServer({ dbPath: config.dbPath });
        await server.start(parsedPort, config.host);
        if (config.apiKey) {
          server.addApiKey(config.apiKey);
          console.log(`[pipal-a2a] 🔐 Auth enabled — API key required`);
        }
        if (config.host === "0.0.0.0" && !config.apiKey) {
          console.warn(`[pipal-a2a] ⚠️  WARNING: host=0.0.0.0 with NO API key — anyone on the network can connect!`);
          console.warn(`[pipal-a2a]    Add apiKey to config/pipal-a2a.yaml or .env`);
        }
        console.log(`[pipal-a2a] 🏠 HOST mode — shared state at ${sharedStateUrl}`);
      } catch (err: any) {
        if (err.code === 'EADDRINUSE') {
          console.log(`[pipal-a2a] ⚠️  Server already running at ${sharedStateUrl} — joining instead`);
          server = null;
        } else throw err;
      }
    }
    if (!server) {
      console.log(`[pipal-a2a] 🔗 JOIN mode — connecting to ${sharedStateUrl}`);
    }

    // Build Google A2A v1.0 AgentCard
    const skills: AgentSkill[] = config.identity.skills.map((s) =>
      createSkill(s, s, `Skill: ${s}`, { tags: config.identity.tags })
    );

    card = createAgentCard(
      config.identity.name,
      sharedStateUrl,
      skills,
      { description: config.identity.description || `Agent: ${config.identity.name}` }
    );

    await client.register(card);
    registry.register(card);

    unsubscribe = client.subscribe((event, data) => {
      handleSSEEvent(event, data);
    }, {
      onReconnect: async () => {
        // Server came back — re-register this agent
        // Register now upserts on existing name (crash recovery)
        try {
          await client.register(card);
          registry.register(card);
          console.log(`[pipal-a2a] 🔄 Re-registered after reconnect: ${card.name}`);
        } catch (err: any) {
          console.warn(`[pipal-a2a] Re-register failed: ${err.message}`);
        }
      },
    });

    const skillList = card.skills.length > 0
      ? card.skills.map((s) => s.id).join(", ")
      : "none";
    const tagList = (config.identity.tags?.length ?? 0) > 0
      ? config.identity.tags!.join(", ")
      : "none";
    console.log(`[pipal-a2a] ✅ Online as "${card.name}" [${skillList}] tags:[${tagList}]`);
    console.log(`[pipal-a2a] pipal_a2a tools: agents() | my_card() | delegate() | status()`);
    console.log(`[pipal-a2a] Check agents() + my_card() BEFORE delegating.`);

    // Pre-flight check: MemPalace enabled but server healthy?
    if (config.mempalace?.enabled) {
      console.log(`[pipal-a2a] 🧠 MemPalace: enabled (${config.mempalace.wing}/${config.mempalace.sharedRoom}) — checking...`);
      // Note: MCP availability is LLM-level. We can't sync-call MCP tools here.
      // Planner's promptGuidelines include MemPalace calls.
      console.log(`[pipal-a2a] ⚠️  Ensure MemPalace MCP is running — planner will call it after delegations.`);
      console.log(`[pipal-a2a]    Install: npm install -g mempalace-mcp`);
      console.log(`[pipal-a2a]    Start: mempalace-mcp --palace <path>`);
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_shutdown
  // ───────────────────────────────────────────────────────────────
  pi.on("session_shutdown", async () => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (client && card) {
      const result = await isolation.finalize(card.name);
      // Only cleanup if finalize succeeded — preserve worktree on failure
      if (result.success) {
        await isolation.cleanup(card.name);
      } else {
        console.warn(`[pipal-a2a] ⚠️  Finalize failed, worktree preserved for recovery.`);
      }
      try { await client.unregister(card.name); } catch {}
    }
    if (server) { await server.stop(); server = null; }
    console.log("[pipal-a2a] Offline");
  });

  // ───────────────────────────────────────────────────────────────
  // Capture LLM responses for delegated tasks
  // Encapsulated in ResponseCapture class — explicit state machine.
  // ───────────────────────────────────────────────────────────────

  pi.on("message_update", (event: any) => {
    capture.onMessageUpdate(event);
  });

  pi.on("agent_end", async (_event: any) => {
    await capture.onAgentEnd();
  });

  // ───────────────────────────────────────────────────────────────
  // SSE Event Handler
  // ───────────────────────────────────────────────────────────────
  function handleSSEEvent(event: string, data: any): void {
    switch (event) {
      case "agent:online":
        if (data?.card && data.card.name !== card?.name) {
          registry.register(data.card);
          console.log(`[pipal-a2a] 👋 ${data.card.name} joined the network`);
        }
        break;
      case "agent:offline":
        if (data?.agentId) {
          registry.unregister(data.agentId);
          console.log(`[pipal-a2a] 👋 ${data.agentId} left the network`);
        }
        break;
      case "task:created":
        handleIncomingTask(data);
        break;
      case "task:completed":
        console.log(`[pipal-a2a] ✅ Task ${data?.taskId?.slice(0, 8)} completed`);
        break;
      case "task:failed":
        console.log(`[pipal-a2a] ❌ Task ${data?.taskId?.slice(0, 8)} failed: ${data?.error}`);
        break;
      case "task:message":
        // Multi-turn: message appended to task history
        break;
    }
  }

  async function handleIncomingTask(data: any): Promise<void> {
    if (!card || !client) return;

    // SSE task:created event: { taskId, from, to, skill, task }
    const taskId = data?.taskId;
    const from = data?.from || "unknown";
    const to = data?.to;
    const skill = data?.skill;
    const description = data?.task || "";

    if (!taskId) {
      console.error(`[pipal-a2a] ❌ handleIncomingTask: no taskId in data:`, JSON.stringify(data).slice(0, 200));
      return;
    }

    const isDirect = to === card.name;
    const isSkillMatch = !to && skill && card.skills.some((s) => s.id === skill);
    if (!isDirect && !isSkillMatch) return;
    if (from === card?.name) return;
    if (capture.isActive) {
      await client.postError(taskId, "Agent busy with another task");
      return;
    }

    // ── Vagueness guard: reject tasks that lack clarity ──
    // Per karpathy-clean-code: prompts > code, but code is the safety net.
    const vagueness = assessTaskClarity(description);
    if (vagueness.reject) {
      const questions = vagueness.questions.join("\n");
      console.log(`[pipal-a2a] ❓ Rejected vague task from ${from}: ${vagueness.reason}`);
      await client.postResult(taskId, 
        `[Task Rejected — Too Vague]\n\n` +
        `Reason: ${vagueness.reason}\n\n` +
        `Please clarify:\n${questions}\n\n` +
        `Resend with: pipal_a2a_delegate({ task: "<clearer task>", to: "${card.name}" })`
      );
      return;
    }

    console.log(`[pipal-a2a] 📩 Delegated task from ${from}: "${String(description).slice(0, 60)}..."`);
    capture.start(taskId);

    // Prepare isolated workspace
    const workDir = await isolation.prepare(card!.name);

    const taskMessage =
      `[Delegated task from ${from}]:\n\n${description}\n\n` +
      `Please complete this task using your tools. Your response will be sent back to ${from}.` +
      (workDir !== process.cwd() ? `\n\nWorking directory: ${workDir}` : "");

    try {
      pi.sendUserMessage(taskMessage);
    } catch (error) {
      console.error(`[pipal-a2a] ❌ sendUserMessage FAILED:`, error);
      await client.postError(taskId, `Failed to inject task: ${error}`);
      capture.cancel();
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_delegate
  // ───────────────────────────────────────────────────────────────
  // Build MemPalace guidelines only if enabled (config activates, not defines)
  const mempalaceGuidelines = config.mempalace?.enabled ? [
    "",
    `[MemPalace] BEFORE delegating: call mempalace_search({ query: <project>, wing: "${config.mempalace.wing}", room: "${config.mempalace.sharedRoom}" }) to check for prior work.`,
    "[MemPalace] BEFORE delegating: call mempalace_kg_query({ entity: <project> }) to find known facts about the project.",
    `[MemPalace] AFTER delegation completes: call mempalace_mempalace_add_drawer({ wing: "${config.mempalace.wing}", room: "${config.mempalace.sharedRoom}", content: <status> }) to update shared/project-status.`,
    "[MemPalace] AFTER delegation completes: call mempalace_mempalace_kg_add({ subject: <project>, predicate: \"has_<role>\", object: \"completed\" }) to record completion.",
    `[MemPalace] AFTER delegation completes: call mempalace_mempalace_diary_write({ agent_name: "planner", entry: "PROJ:<project>|TASK:<task>|AGENT:<role>|★★★★", wing: "${config.mempalace.wing}" }) to log the decision.`,
    "[MemPalace] Write ONLY to shared/ — NOT to per-agent rooms. Per-agent rooms are scratch only.",
    "[MemPalace] Total: 5 calls (search + kg_query before; add_drawer + kg_add + diary_write after).",
  ] : [];

  pi.registerTool({
    name: "pipal_a2a_delegate",
    label: "Delegate to Agent (A2A)",
    description:
      "Send a task to another agent terminal in the P2P agent network. " +
      "If the task matches a workflow name in config/team.yaml, " +
      "the entire workflow will be executed automatically. " +
      "IMPORTANT: This is the ONLY way to delegate work to other pi terminals. " +
      "Use this tool instead of subagents when you want to send work to another terminal. " +
      "The other agent's LLM will process the task in its own terminal (the user can see it working). " +
      "Waits up to 2 minutes for the result.",
    promptSnippet: "Delegate work to other pi terminals via P2P A2A network",
    promptGuidelines: [
      "IMPORTANT: You are an ORCHESTRATOR — NEVER write code or create project files yourself. ONLY delegate via pipal_a2a_delegate.",
      "Before delegating: call pipal_a2a_agents() to find correct agent names. Then use to=<name>.",
      "Before delegating: call pipal_a2a_my_card() to check your own skills. Handle it yourself ONLY if you have matching skills.",
      "Delegate ONLY when: (1) task requires skills you don't have, (2) task is too complex for one agent.",
      "When delegating multiple specialized tasks (e.g., 'node.js backend + react frontend'), call pipal_a2a_delegate separately for each.",
      "If delegation returns incomplete results: delegate AGAIN with a clearer task — do NOT build it yourself.",
      "If no agent name known: omit to= and skill= — SmartRouter will pick the right agent by tag.",
      "[MemPalace] AFTER delegation completes: call mempalace_mempalace_add_drawer({ wing: \"wing_pipal_a2a\", room: \"shared\", content: <status> }) to update shared/project-status.",
      "[MemPalace] AFTER delegation completes: call mempalace_mempalace_kg_add({ subject: <project>, predicate: \"has_<role>\", object: \"completed\" }) to record completion.",
      "[Worktree Isolation] After ALL delegated tasks complete: call pipal_a2a_merge({ branch: 'agent/<agentName>' }) for each agent to integrate their work. Then agents auto-cleanup.",
      ...mempalaceGuidelines,
    ],
    parameters: Type.Object({
      task: Type.String({ description: "The task description to delegate" }),
      skill: Type.Optional(Type.String({ description: "Required skill ID for routing" })),
      to: Type.Optional(Type.String({ description: "Specific agent ID (bypasses routing)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!client || !card) {
        return {
          content: [{ type: "text" as const, text: "Error: Agent network not started." }],
          details: { error: "not_started" },
        };
      }

      try {
        // Route using shared state (not local registry — SSE may miss events)
        const onlineAgents = await client.listAgents();
        const others = onlineAgents.filter((a: AgentCard) => a.name !== card!.name);

        // ── Workflow PreHook: intercept if task matches a workflow name ──
        // karpathy-clean-code: PreHook runs before Core. Config activates.
        if (!params.to && !params.skill) {
          const { executed, summary } = await executeWorkflowIfMatch(
            params.task,
            client,
            card!,
            others,
            signal,
            onUpdate,
          );
          if (executed) {
            return {
              content: [{ type: "text" as const, text: summary || "Workflow completed successfully." }],
              details: { workflow: true },
            };
          }
        }
        // ── End Workflow PreHook — fall through to normal delegation ──

        let targetCard: AgentCard | undefined;

        // Direct routing — target agent specified by name
        if (params.to) {
          targetCard = others.find((a: AgentCard) => a.name === params.to);
          if (!targetCard) {
            return {
              content: [{
                type: "text" as const,
                text: `Agent "${params.to}" not found. Online: ${others.map((a: AgentCard) => a.name).join(", ") || "none"}`,
              }],
              details: { error: "not_found" },
            };
          }
        }

        // Skill-based routing
        if (!targetCard && params.skill) {
          const matches = others.filter((a: AgentCard) =>
            a.skills.some((s) => s.id === params.skill)
          );
          if (matches.length > 0) targetCard = matches[0];
        }

      // Auto-route: no explicit to or skill → use SmartRouter
      if (!targetCard && !params.to && !params.skill) {
        const smart = new SmartRouter();
        const task = {
          id: "preview",
          status: { state: "TASK_STATE_SUBMITTED" as any, timestamp: new Date().toISOString() },
          history: [{
            messageId: "preview",
            role: "ROLE_USER" as any,
            parts: [{ text: params.task }],
          }],
          metadata: {},
        };
        targetCard = smart.select(task, others, card.name);  // ← exclude self
        if (targetCard) {
          console.log(`[pipal-a2a] 🎯 Auto-routed to ${targetCard.name} (SmartRouter)`);
        }
      }

        // Fallback — pick first available other agent
        if (!targetCard && others.length > 0) {
          targetCard = others[0];
        }

        if (!targetCard) {
          return {
            content: [{
              type: "text" as const,
              text: `No other agent available. Online: ${onlineAgents.map((a: AgentCard) => a.name).join(", ") || "none"}`,
            }],
            details: { error: "no_agent" },
          };
        }

        console.log(`[pipal-a2a] 🎯 Routing to ${targetCard.name} (online: ${onlineAgents.map((a: AgentCard) => a.name).join(", ")})`);

        // Submit task to shared state
        const taskId = await client.createTask({
          from: card.name,
          to: targetCard.name,
          skill: params.skill,
          task: params.task,
        });

        console.log(`[pipal-a2a] 📤 Task ${taskId.slice(0, 8)} → ${targetCard.name}: "${params.task.slice(0, 50)}..."`);

        // Use shared waitForTaskCompletion (handles streaming + multi-turn + abort)
        const result = await waitForTaskCompletion(
          client, taskId, 120_000, new AbortController().signal, onUpdate, card.name, targetCard.name
        );

        if (result.status.state === "TASK_STATE_COMPLETED") {
          const resultText = result.artifacts?.[0]?.parts?.[0]?.text
            ?? JSON.stringify(result.artifacts, null, 2);

          const durationMs = result.artifacts?.[0]
            ? new Date(result.status.timestamp).getTime() - (result.metadata?.createdAt as number || 0)
            : 0;

          return {
            content: [{
              type: "text" as const,
              text: `**Result from ${targetCard.name}:**\n\n${resultText}`,
            }],
            details: {
              taskId,
              from: card.name,
              to: targetCard.name,
              state: result.status.state,
              durationMs,
            },
          };
        } else {
          return {
            content: [{
              type: "text" as const,
              text: `Task failed on ${targetCard.name}: ${result.metadata?.error || "Unknown error"}`,
            }],
            details: { taskId, error: result.metadata?.error },
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Delegation error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: { error: String(error) },
        };
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_agents
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_agents",
    label: "List Online Agents",
    description: "List all online agents in the P2P network with their skills and tags.",
    promptSnippet: "List online agents",
    promptGuidelines: [
      "Use pipal_a2a_agents before pipal_a2a_delegate to find the correct agent name.",
      "Check online agents before guessing names — wrong names cause delegation failures.",
    ],
    parameters: Type.Object({}),
    async execute() {
      if (!client || !card) {
        return { content: [{ type: "text" as const, text: "Error: Agent network not started." }] };
      }
      try {
        const agents = await client.listAgents();
        const lines = agents.map((a) => {
          const skills = a.skills.map((s) => s.id).join(", ");
          const tags = [...new Set(a.skills.flatMap((s) => s.tags || []))].join(", ");
          return `- ${a.name}: [${skills}] tags:[${tags}]`;
        });
        return {
          content: [{ type: "text" as const, text: `Online agents:\n${lines.join("\n")}` }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Failed: ${e}` }] };
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_my_card
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_my_card",
    label: "Show My Agent Card",
    description: "Show your own AgentCard — your name, skills, and tags.",
    promptSnippet: "Show my agent card",
    promptGuidelines: [
      "Use pipal_a2a_my_card to check your own capabilities before deciding to delegate.",
      "If your skills match the task, handle it yourself — do not delegate.",
    ],
    parameters: Type.Object({}),
    async execute() {
      if (!card) {
        return { content: [{ type: "text" as const, text: "Error: Agent network not started." }] };
      }
      const skills = card.skills.map((s) => `${s.id} (tags:${s.tags?.join(",") || ""})`).join("\n  ");
      return {
        content: [{
          type: "text" as const,
          text: `My AgentCard:\n- name: ${card.name}\n- skills:\n  ${skills}`,
        }],
      };
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_status
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_status",
    label: "Check Network Status",
    description: "Check the health of the P2P agent network.",
    promptSnippet: "Check network status",
    promptGuidelines: [
      "Use pipal_a2a_status to verify the network is healthy before delegating.",
    ],
    parameters: Type.Object({}),
    async execute() {
      if (!client) {
        return { content: [{ type: "text" as const, text: "Error: Agent network not started." }] };
      }
      try {
        const agents = await client.listAgents();
        return {
          content: [{
            type: "text" as const,
            text: `Network: ${agents.length} agent(s) online. Status: healthy`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Network error: ${e}` }] };
      }
    },
  });
  // ───────────────────────────────────────────────────────────────
  pi.registerCommand("pipal-status", {
    description: "Show P2P agent network status (Google A2A)",
    handler: async (_args, ctx) => {
      if (!client) {
        ctx.ui.notify("Agent network not started", "warning");
        return;
      }
      try {
        const agents = await client.listAgents();
        if (agents.length === 0) {
          ctx.ui.notify("No agents online", "warning");
          return;
        }
        const lines = agents
          .map((a) => {
            const isYou = a.name === card?.name;
            const skills = a.skills.map((s) => s.id).join(", ") || "none";
            const iface = a.supportedInterfaces[0];
            return `  ${isYou ? "→ " : "  "}${a.name}: [${skills}]${isYou ? " (you)" : ""} ${iface?.protocolBinding || ""}`;
          })
          .join("\n");
        ctx.ui.notify(`${agents.length} agent(s) online (A2A v1.0):\n${lines}`, "info");
      } catch (error) {
        ctx.ui.notify(`Failed to get status: ${error}`, "error");
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Command: /pipal-role — pick identity from team.yaml roles
  // ───────────────────────────────────────────────────────────────
  pi.registerCommand("pipal-role", {
    description: "Set this terminal's role from team.yaml (e.g. /pipal-role backend)",
    handler: async (args, ctx) => {
      const roleName = (args as string).trim();
      if (!roleName) {
        // List available roles — show which are claimed
        const roles = loadTeamRoles();
        if (roles.size === 0) {
          ctx.ui.notify("No roles found in team.yaml. Create config/team.yaml with team.roles.", "warning");
          return;
        }
        let claimedNames: string[] = [];
        if (client) {
          try {
            const agents = await client.listAgents();
            claimedNames = agents.map(a => a.name).filter(n => n !== card?.name);
          } catch {}
        }
        const list = Array.from(roles.entries())
          .map(([name, r]) => {
            const claimed = claimedNames.includes(name);
            const tagStr = r.tags?.length ? " tags:[" + r.tags.join(", ") + "]" : "";
            return `  ${name.padEnd(12)} [${r.skills.join(", ")}]${tagStr}${claimed ? " ⚠️ TAKEN" : ""}`;
          })
          .join("\n");
        ctx.ui.notify(`Available roles:\n${list}\n\nUsage: /pipal-role <name>`, "info");
        return;
      }

      const roles = loadTeamRoles();
      const role = roles.get(roleName);
      if (!role) {
        const available = Array.from(roles.keys()).join(", ");
        ctx.ui.notify(`Unknown role "${roleName}". Available: ${available}`, "error");
        return;
      }

      // Check if role already claimed by another agent on the network
      if (client) {
        try {
          const agents = await client.listAgents();
          const claimed = agents.find(a => a.name === roleName && a.name !== card?.name);
          if (claimed) {
            const availableRoles = Array.from(roles.keys())
              .filter(r => !agents.some(a => a.name === r && a.name !== card?.name));
            ctx.ui.notify(
              `⚠️ "${roleName}" is already online. Pick a different role:\n  Available: ${availableRoles.join(", ") || "none (all claimed)"}`,
              "warning"
            );
            return;
          }
        } catch {
          // Network not reachable — allow role pick anyway
        }
      }

      // Update config
      config.role = roleName;
      config.identity.name = role.name;
      config.identity.description = role.description;
      config.identity.skills = role.skills;
      config.identity.tags = role.tags || [];

      // Re-register on the network
      if (!client) {
        ctx.ui.notify("Agent network not started yet. Role saved for next session.", "warning");
        return;
      }

      // Unregister old card
      if (card) {
        try { await client.unregister(card.name); } catch {}
      }

      // Build new card
      const skills: AgentSkill[] = config.identity.skills.map((s) =>
        createSkill(s, s, `Skill: ${s}`, { tags: config.identity.tags })
      );
      card = createAgentCard(
        config.identity.name,
        config.sharedState,
        skills,
        { description: config.identity.description || `Agent: ${config.identity.name}` }
      );

      await client.register(card);
      registry.register(card);

      const skillList = card.skills.map(s => s.id).join(", ");
      const tagList = config.identity.tags.join(", ");
      ctx.ui.notify(`✅ Role: ${role.name} [${skillList}] tags:[${tagList}]`, "info");
      console.log(`[pipal-a2a] 🔄 Re-registered as "${card.name}" [${skillList}] tags:[${tagList}]`);
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_ask (multi-turn follow-up)
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_ask",
    label: "Ask Follow-Up Question (A2A)",
    description:
      "Ask a follow-up question on a delegated task when you need clarification. " +
      "Use ONLY when you are processing a task from another agent and need more information. " +
      "The question will be sent back to the delegating agent.",
    promptSnippet: "Ask follow-up question on delegated task",
    promptGuidelines: [
      "Use pipal_a2a_ask when processing a delegated task and you need clarification.",
      "The question goes back to the agent that sent you the task.",
      "After asking, wait — the delegating agent will respond with more information.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The follow-up question to ask the delegating agent" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!client || !capture.currentTaskId) {
        return {
          content: [{ type: "text" as const, text: "Error: No active delegated task to ask about." }],
          details: { error: "no_task" },
        };
      }

      try {
        const task = await client.sendFollowUp(capture.currentTaskId, params.question, {
          role: "ROLE_AGENT",
          requireInput: true,
        });
        console.log(`[pipal-a2a] ❓ Asked follow-up on ${capture.currentTaskId.slice(0, 8)}: "${params.question.slice(0, 40)}..."`);
        return {
          content: [{
            type: "text" as const,
            text: `Question sent to delegating agent. Waiting for response...`,
          }],
          details: { taskId: capture.currentTaskId, asked: true },
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to ask follow-up: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_merge (only useful with worktree isolation)
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_merge",
    description:
      "Merge an agent's worktree branch back to the current branch. " +
      "Use after all agents complete their tasks. Only needed with worktree isolation.",
    parameters: Type.Object({
      branch: Type.String({ description: "Agent branch to merge (e.g. 'agent/backend')" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!(isolation instanceof WorktreeIsolation)) {
        return {
          content: [{ type: "text" as const, text: "Merge only available with worktree isolation. Current: none." }],
        };
      }

      // Validate branch name (same rules as agent names)
      const branch = params.branch;
      if (!/^agent\/[a-zA-Z0-9_-]+$/.test(branch)) {
        return {
          content: [{ type: "text" as const, text: `Invalid branch name: ${branch}. Expected format: agent/<name> with alphanumeric/hyphen/underscore only.` }],
        };
      }

      try {
        const { execFileSync } = require("child_process");
        const out = execFileSync("git", ["merge", branch, "--no-edit"], {
          cwd: process.cwd(),
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        console.log(`[pipal-a2a] 🔀 Merged ${branch}`);
        return {
          content: [{ type: "text" as const, text: `Merged ${branch}\n${out}` }],
        };
      } catch (error: any) {
        const msg = error?.stderr?.trim() || error?.message || String(error);
        return {
          content: [{ type: "text" as const, text: `Merge conflict or error:\n${msg}\n\nOptions:\n  1. Resolve manually: edit conflicting files, then git add + git commit\n  2. Accept agent changes: git checkout --theirs <file> && git add && git commit\n  3. Abort: git merge --abort` }],
          details: { error: true, branch },
        };
      }
    },
  });
}
