/**
 * Tests for Agent Isolation strategies
 *
 * Layer 2 (karpathy-clean-code): stub-based, no mocks.
 * NoIsolation: zero side effects, returns cwd.
 * WorktreeIsolation: real git operations in temp directories.
 */

import { describe, it, expect, afterEach } from "vitest";
import { NoIsolation } from "../src/builtin/isolation/no-isolation.js";
import { WorktreeIsolation } from "../src/builtin/isolation/worktree-isolation.js";
import { execSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── NoIsolation ──────────────────────────────────────────────────

describe("NoIsolation", () => {
  it("returns cwd for prepare", async () => {
    const iso = new NoIsolation();
    const dir = await iso.prepare("backend");
    expect(dir).toBe(process.cwd());
  });

  it("returns cwd for getWorkDir", () => {
    const iso = new NoIsolation();
    expect(iso.getWorkDir("backend")).toBe(process.cwd());
  });

  it("finalize does nothing", async () => {
    const iso = new NoIsolation();
    await expect(iso.finalize("backend")).resolves.toBeUndefined();
  });

  it("cleanup does nothing", async () => {
    const iso = new NoIsolation();
    await expect(iso.cleanup("backend")).resolves.toBeUndefined();
  });

  it("same dir for different agents", async () => {
    const iso = new NoIsolation();
    const d1 = await iso.prepare("backend");
    const d2 = await iso.prepare("frontend");
    expect(d1).toBe(d2);
  });
});

// ── WorktreeIsolation ────────────────────────────────────────────

describe("WorktreeIsolation", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true }); } catch {}
    }
  });

  function makeGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "iso-test-"));
    tmpDirs.push(dir);
    execSync("git init", { cwd: dir });
    execSync("git config user.email test@test.com", { cwd: dir });
    execSync("git config user.name Test", { cwd: dir });
    writeFileSync(join(dir, "README.md"), "# test");
    execSync("git add -A && git commit -m init", { cwd: dir });
    return dir;
  }

  it("throws if not in a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "iso-nogit-"));
    tmpDirs.push(dir);
    const orig = process.cwd();
    process.chdir(dir);
    try {
      expect(() => new WorktreeIsolation()).toThrow("git repo");
    } finally {
      process.chdir(orig);
    }
  });

  it("creates worktree on prepare", async () => {
    const repo = makeGitRepo();
    const orig = process.cwd();
    process.chdir(repo);
    try {
      const iso = new WorktreeIsolation();
      const dir = await iso.prepare("backend");

      expect(dir).toBe(join(repo, ".pipal-a2a", "worktrees", "backend"));
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, "README.md"))).toBe(true);
    } finally {
      process.chdir(orig);
    }
  });

  it("getWorkDir returns correct path", () => {
    const repo = makeGitRepo();
    const orig = process.cwd();
    process.chdir(repo);
    try {
      const iso = new WorktreeIsolation();
      expect(iso.getWorkDir("backend")).toBe(join(repo, ".pipal-a2a", "worktrees", "backend"));
    } finally {
      process.chdir(orig);
    }
  });

  it("finalize commits changes", async () => {
    const repo = makeGitRepo();
    const orig = process.cwd();
    process.chdir(repo);
    try {
      const iso = new WorktreeIsolation();
      const dir = await iso.prepare("backend");

      // Write a file in the worktree
      writeFileSync(join(dir, "api.ts"), "export const app = 1;");
      await iso.finalize("backend");

      // Check the branch has the commit
      const log = execSync("git log agent/backend --oneline", { cwd: repo, encoding: "utf-8" });
      expect(log).toContain("agent(backend)");
    } finally {
      process.chdir(orig);
    }
  });

  it("cleanup removes worktree", async () => {
    const repo = makeGitRepo();
    const orig = process.cwd();
    process.chdir(repo);
    try {
      const iso = new WorktreeIsolation();
      const dir = await iso.prepare("backend");
      expect(existsSync(dir)).toBe(true);

      await iso.cleanup("backend");
      expect(existsSync(dir)).toBe(false);
    } finally {
      process.chdir(orig);
    }
  });

  it("prepare is idempotent", async () => {
    const repo = makeGitRepo();
    const orig = process.cwd();
    process.chdir(repo);
    try {
      const iso = new WorktreeIsolation();
      const d1 = await iso.prepare("backend");
      const d2 = await iso.prepare("backend");
      expect(d1).toBe(d2);
    } finally {
      process.chdir(orig);
    }
  });

  it("multiple agents get separate worktrees", async () => {
    const repo = makeGitRepo();
    const orig = process.cwd();
    process.chdir(repo);
    try {
      const iso = new WorktreeIsolation();
      const d1 = await iso.prepare("backend");
      const d2 = await iso.prepare("frontend");

      expect(d1).not.toBe(d2);
      expect(existsSync(d1)).toBe(true);
      expect(existsSync(d2)).toBe(true);

      // Write to backend, frontend shouldn't see it
      writeFileSync(join(d1, "api.ts"), "backend code");
      expect(existsSync(join(d1, "api.ts"))).toBe(true);
      expect(existsSync(join(d2, "api.ts"))).toBe(false);
    } finally {
      process.chdir(orig);
    }
  });
});
