/**
 * WorktreeIsolation — git worktree per agent.
 *
 * Prevents file conflicts when multiple agents edit the same project.
 * Each agent gets its own git worktree on a dedicated branch.
 *
 * Lifecycle:
 *   prepare()  → git worktree add .pipal-a2a/worktrees/<agent> -b agent/<agent>
 *   finalize() → git add -A && git commit in the worktree
 *   cleanup()  → git worktree remove (on disconnect)
 *
 * Falls back to NoIsolation if not in a git repo.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { IsolationStrategy } from "./isolation.js";

export class WorktreeIsolation implements IsolationStrategy {
  private readonly cwd: string;
  private readonly worktreeBase: string;
  private readonly prepared = new Set<string>();

  constructor() {
    this.cwd = process.cwd();
    this.worktreeBase = join(this.cwd, ".pipal-a2a", "worktrees");

    // Verify we're in a git repo
    if (!this.isGitRepo()) {
      throw new Error(
        "WorktreeIsolation requires a git repo. " +
        "Run `git init` or use `isolation: none` in config."
      );
    }
  }

  async prepare(agentName: string): Promise<string> {
    const workDir = this.getWorkDir(agentName);
    const branch = `agent/${agentName}`;

    // Already prepared — return existing worktree
    if (this.prepared.has(agentName) && existsSync(workDir)) {
      return workDir;
    }

    // Ensure base directory exists
    if (!existsSync(this.worktreeBase)) {
      mkdirSync(this.worktreeBase, { recursive: true });
    }

    try {
      // Try creating a new worktree
      this.git(`worktree add "${workDir}" -b ${branch}`);
    } catch {
      // Branch or worktree may already exist — try to recover
      try {
        // Worktree dir exists but not tracked? Just use it
        if (existsSync(workDir)) {
          // Try pruning stale worktrees
          this.git("worktree prune");
          // Try again
          this.git(`worktree add "${workDir}" ${branch}`);
        } else {
          // Branch exists but worktree doesn't — checkout existing branch
          this.git(`worktree add "${workDir}" ${branch}`);
        }
      } catch {
        // Last resort: reset the worktree
        try {
          this.git(`worktree remove "${workDir}" --force 2>/dev/null || true`);
          this.git(`branch -D ${branch} 2>/dev/null || true`);
          this.git(`worktree add "${workDir}" -b ${branch}`);
        } catch (err) {
          throw new Error(
            `Failed to create worktree for ${agentName}: ${err}`
          );
        }
      }
    }

    this.prepared.add(agentName);
    console.log(`[isolation] 📂 ${agentName} worktree at ${workDir} (branch: ${branch})`);
    return workDir;
  }

  async finalize(agentName: string): Promise<void> {
    if (!this.prepared.has(agentName)) return;

    const workDir = this.getWorkDir(agentName);
    if (!existsSync(workDir)) return;

    try {
      // Stage and commit all changes in the worktree
      this.git(`-C "${workDir}" add -A`);

      // Check if there's anything to commit
      const status = this.git(`-C "${workDir}" status --porcelain`).trim();
      if (status) {
        const msg = `agent(${agentName}): task completed`;
        this.git(`-C "${workDir}" commit -m "${msg}" --allow-empty`);
        console.log(`[isolation] ✅ ${agentName} committed changes`);
      } else {
        console.log(`[isolation] ✅ ${agentName} no changes to commit`);
      }
    } catch (err) {
      console.warn(`[isolation] ⚠️  ${agentName} finalize failed: ${err}`);
    }
  }

  getWorkDir(agentName: string): string {
    return join(this.worktreeBase, agentName);
  }

  async cleanup(agentName: string): Promise<void> {
    if (!this.prepared.has(agentName)) return;

    const workDir = this.getWorkDir(agentName);
    this.prepared.delete(agentName);

    try {
      this.git(`worktree remove "${workDir}" --force`);
      console.log(`[isolation] 🧹 ${agentName} worktree removed`);
    } catch {
      // Non-critical — worktree may already be gone
      try { this.git("worktree prune"); } catch {}
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private git(args: string): string {
    return execSync(`git ${args}`, {
      cwd: this.cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  private isGitRepo(): boolean {
    try {
      execSync("git rev-parse --git-dir", {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  }
}
