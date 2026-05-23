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
 * Falls back gracefully if not in a git repo or git not installed.
 * All git operations are async (no event loop blocking).
 * Agent names are sanitized (shell-injection safe).
 */

import { execFile } from "child_process";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join, resolve, sep } from "path";
import type { IsolationStrategy } from "./isolation.js";

export class WorktreeIsolation implements IsolationStrategy {
  private readonly cwd: string;
  private readonly worktreeBase: string;
  private readonly prepared = new Set<string>();
  /** Per-agent locks to prevent prepare/cleanup races */
  private readonly locks = new Map<string, Promise<void>>();

  constructor() {
    this.cwd = process.cwd();
    this.worktreeBase = join(this.cwd, ".pipal-a2a", "worktrees");

    // Verify git is installed and we're in a repo
    this.requireGit();
  }

  async prepare(agentName: string): Promise<string> {
    this.validateName(agentName);
    return this.withLock(agentName, async () => {
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

      // Prune stale worktrees from previous crashes
      await this.git(["worktree", "prune"]);

      try {
        // Try creating a new worktree with a new branch
        await this.git(["worktree", "add", workDir, "-b", branch]);
      } catch {
        try {
          // Branch may already exist — checkout without -b
          await this.git(["worktree", "add", workDir, branch]);
        } catch {
          // Last resort: force-remove and retry
          await this.git(["worktree", "remove", workDir, "--force"]).catch(() => {});
          await this.git(["branch", "-D", branch]).catch(() => {});
          await this.git(["worktree", "add", workDir, "-b", branch]);
        }
      }

      this.prepared.add(agentName);
      console.log(`[isolation] 📂 ${agentName} worktree at ${workDir} (branch: ${branch})`);
      return workDir;
    });
  }

  async finalize(agentName: string): Promise<{ success: boolean; error?: string }> {
    this.validateName(agentName);
    if (!this.prepared.has(agentName)) return { success: true };

    const workDir = this.getWorkDir(agentName);
    if (!existsSync(workDir)) return { success: true };

    try {
      // Stage all changes in the worktree
      await this.git(["-C", workDir, "add", "-A"]);

      // Check if there's anything to commit
      const status = (await this.git(["-C", workDir, "status", "--porcelain"])).trim();
      if (status) {
        const msg = `agent(${agentName}): task completed`;
        await this.git(["-C", workDir, "commit", "-m", msg, "--no-verify"]);
        console.log(`[isolation] ✅ ${agentName} committed changes`);
      } else {
        console.log(`[isolation] ✅ ${agentName} no changes to commit`);
      }
      return { success: true };
    } catch (err) {
      const errorMsg = String(err);
      console.error(`[isolation] ❌ ${agentName} finalize FAILED: ${errorMsg}`);
      // DON'T swallow — return failure so caller knows NOT to cleanup
      return { success: false, error: errorMsg };
    }
  }

  getWorkDir(agentName: string): string {
    const resolved = resolve(this.worktreeBase, agentName);
    // Prevent path traversal
    if (!resolved.startsWith(resolve(this.worktreeBase) + sep) &&
        resolved !== resolve(this.worktreeBase)) {
      throw new Error(`Agent name escapes worktree base: ${agentName}`);
    }
    return resolved;
  }

  async cleanup(agentName: string): Promise<void> {
    this.validateName(agentName);
    if (!this.prepared.has(agentName)) return;

    const workDir = this.getWorkDir(agentName);
    this.prepared.delete(agentName);

    try {
      await this.git(["worktree", "remove", workDir, "--force"]);
      console.log(`[isolation] 🧹 ${agentName} worktree removed`);
    } catch {
      // Non-critical — worktree may already be gone
      await this.git(["worktree", "prune"]).catch(() => {});
    }
  }

  /**
   * Startup cleanup — prune stale worktrees from previous crashes.
   * Call once after construction.
   */
  async cleanupStale(): Promise<void> {
    try {
      await this.git(["worktree", "prune"]);
    } catch {}

    // Remove orphan directories in worktreeBase that aren't tracked by git
    if (existsSync(this.worktreeBase)) {
      const entries = readdirSync(this.worktreeBase, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const name of entries) {
        if (!this.prepared.has(name)) {
          const dir = join(this.worktreeBase, name);
          try {
            // Check if git still tracks this worktree
            const list = await this.git(["worktree", "list", "--porcelain"]);
            if (!list.includes(dir)) {
              // Orphan — remove directory
              const { rmSync } = await import("fs");
              rmSync(dir, { recursive: true, force: true });
              console.log(`[isolation] 🧹 Cleaned orphan worktree dir: ${name}`);
            }
          } catch {}
        }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Execute a git command asynchronously (no event loop blocking).
   * Uses execFile with array args — no shell, no injection risk.
   */
  private git(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", args, {
        cwd: this.cwd,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          reject(new Error(`git ${args.join(" ")}: ${msg}`));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Validate agent name — only alphanumeric, hyphens, underscores.
   * Prevents shell injection and path traversal at the input boundary.
   */
  private validateName(name: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        `Invalid agent name "${name}". Only alphanumeric, hyphens, and underscores allowed.`
      );
    }
  }

  /**
   * Verify git is installed and we're in a git repo.
   * Distinguishes "not installed" from "not a repo" for clear errors.
   */
  private requireGit(): void {
    // Synchronous check — only runs once at construction
    const { execFileSync } = require("child_process");
    try {
      execFileSync("git", ["rev-parse", "--git-dir"], {
        cwd: this.cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new Error(
          "git is not installed. Install git or use isolation: none in config."
        );
      }
      throw new Error(
        "WorktreeIsolation requires a git repo. " +
        "Run `git init` or use isolation: none in config."
      );
    }
  }

  /**
   * Per-agent mutex — prevents concurrent prepare/cleanup races.
   */
  private async withLock<T>(agentName: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock to resolve
    while (this.locks.has(agentName)) {
      await this.locks.get(agentName);
    }
    let unlock!: () => void;
    const lock = new Promise<void>(r => { unlock = r; });
    this.locks.set(agentName, lock);
    try {
      return await fn();
    } finally {
      this.locks.delete(agentName);
      unlock();
    }
  }
}
