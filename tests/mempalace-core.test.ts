import { describe, it, expect } from "vitest";
import {
  resolveProjectName,
  mergeDrawerContent,
  extractSection,
  canWriteShared,
  SHARED_WRITE_OWNERSHIP,
  DEFAULT_MEMPALACE_CONFIG,
} from "../src/extension/mempalace-types";
import { loadMempalaceConfig } from "../src/extension/mempalace";

// ── resolveProjectName ──────────────────────────────────

describe("resolveProjectName", () => {
  it("uses workflow name when provided", () => {
    expect(resolveProjectName("btc-trading", "/home/user/pipal-a2a")).toBe("btc-trading");
  });

  it("uses workflow name even if cwd is pipal-a2a", () => {
    expect(resolveProjectName("todo-app", "/home/user/pipal-a2a")).toBe("todo-app");
  });

  it("falls back to cwd basename when no workflow", () => {
    expect(resolveProjectName(undefined, "/home/user/my-project")).toBe("my-project");
  });

  it("returns scratch when cwd is pipal-a2a", () => {
    expect(resolveProjectName(undefined, "/home/user/pipal-a2a")).toBe("scratch");
  });

  it("returns scratch when cwd is src", () => {
    expect(resolveProjectName(undefined, "/home/user/project/src")).toBe("scratch");
  });

  it("handles empty cwd gracefully", () => {
    expect(resolveProjectName(undefined, "")).toBe("scratch");
  });
});

// ── extractSection ──────────────────────────────────────

describe("extractSection", () => {
  const content = `# btc-trading

## What I Built
Express API with 4 routes

## Decisions
Used in-memory storage

## History
- 2026-05-20: Built initial API
- 2026-05-19: Started project

## Updated: 2026-05-21`;

  it("extracts existing section", () => {
    expect(extractSection(content, "What I Built")).toContain("Express API");
  });

  it("extracts History section", () => {
    const history = extractSection(content, "History");
    expect(history).toContain("2026-05-20");
    expect(history).toContain("2026-05-19");
  });

  it("returns empty string for missing section", () => {
    expect(extractSection(content, "Nonexistent")).toBe("");
  });

  it("returns empty string for empty content", () => {
    expect(extractSection("", "What I Built")).toBe("");
  });
});

// ── mergeDrawerContent ──────────────────────────────────

describe("mergeDrawerContent", () => {
  it("merges history from existing into new", () => {
    const existing = `# btc-trading

## What I Built
Old Express API

## History
- 2026-05-20: Built initial API

## Updated: 2026-05-20`;

    const newContent = `# btc-trading

## What I Built
Updated Express API with 6 routes

## History

## Updated: 2026-05-21`;

    const merged = mergeDrawerContent(existing, newContent);
    expect(merged).toContain("Updated Express API with 6 routes");
    expect(merged).toContain("2026-05-20: Built initial API");
  });

  it("works when existing has no history", () => {
    const existing = `# btc-trading

## What I Built
First version

## Updated: 2026-05-20`;

    const newContent = `# btc-trading

## What I Built
Second version

## History

## Updated: 2026-05-21`;

    const merged = mergeDrawerContent(existing, newContent);
    expect(merged).toContain("Second version");
  });
});

// ── canWriteShared ──────────────────────────────────────

describe("canWriteShared", () => {
  it("allows owner to write", () => {
    expect(canWriteShared("backend", "api-spec")).toBe(true);
  });

  it("blocks non-owner from writing", () => {
    expect(canWriteShared("frontend", "api-spec")).toBe(false);
  });

  it("allows any agent for unowned doc types", () => {
    expect(canWriteShared("backend", "unknown-doc")).toBe(true);
    expect(canWriteShared("frontend", "unknown-doc")).toBe(true);
  });

  it("planner owns project-spec", () => {
    expect(canWriteShared("planner", "project-spec")).toBe(true);
    expect(canWriteShared("backend", "project-spec")).toBe(false);
  });
});

// ── SHARED_WRITE_OWNERSHIP ──────────────────────────────

describe("SHARED_WRITE_OWNERSHIP", () => {
  it("has expected ownership entries", () => {
    expect(SHARED_WRITE_OWNERSHIP["api-spec"]).toBe("backend");
    expect(SHARED_WRITE_OWNERSHIP["project-spec"]).toBe("planner");
    expect(SHARED_WRITE_OWNERSHIP["security-checklist"]).toBe("security");
  });
});

// ── DEFAULT_MEMPALACE_CONFIG ────────────────────────────

describe("DEFAULT_MEMPALACE_CONFIG", () => {
  it("is disabled by default", () => {
    expect(DEFAULT_MEMPALACE_CONFIG.enabled).toBe(false);
  });

  it("uses wing_a2a", () => {
    expect(DEFAULT_MEMPALACE_CONFIG.wing).toBe("wing_a2a");
  });
});

// ── loadMempalaceConfig ─────────────────────────────────

describe("loadMempalaceConfig", () => {
  it("returns default when no mempalace key", () => {
    const config = loadMempalaceConfig({});
    expect(config.enabled).toBe(false);
  });

  it("returns default when null", () => {
    const config = loadMempalaceConfig(null);
    expect(config.enabled).toBe(false);
  });

  it("merges yaml config with defaults", () => {
    const config = loadMempalaceConfig({
      mempalace: { enabled: true },
    });
    expect(config.enabled).toBe(true);
    expect(config.wing).toBe("wing_a2a"); // default preserved
  });

  it("overrides all fields", () => {
    const config = loadMempalaceConfig({
      mempalace: {
        enabled: true,
        wing: "wing_custom",
        autoQuery: false,
        autoStore: false,
      },
    });
    expect(config.enabled).toBe(true);
    expect(config.wing).toBe("wing_custom");
    expect(config.autoQuery).toBe(false);
    expect(config.autoStore).toBe(false);
  });
});
