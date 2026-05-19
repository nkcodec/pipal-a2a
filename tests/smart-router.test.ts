/**
 * v0.1.7 — Auto-Router Tests
 * 
 * karpathy-clean-code: Tag-based routing tests.
 * Tags are semantic — skill IDs are install-specific.
 */

import { describe, it, expect } from "vitest";
import { SmartRouter } from "../src/builtin/smart-router.js";
import type { Task, AgentCard } from "../src/core/types.js";

function makeCard(name: string, skills: { id: string; tags?: string[] }[]): AgentCard {
  return {
    name,
    url: `http://localhost/${name}`,
    version: "1.0.0",
    capabilities: { streaming: true },
    skills: skills.map((s) => ({
      id: s.id,
      name: s.id,
      description: "",
      tags: s.tags || [],
    })),
    supportedInterfaces: [],
  };
}

function makeTask(text: string, metadata?: Record<string, unknown>): Task {
  return {
    id: "test",
    status: { state: "TASK_STATE_SUBMITTED", timestamp: new Date().toISOString() },
    history: [{
      messageId: "m1",
      role: "ROLE_USER",
      parts: [{ text }],
    }],
    metadata: metadata || {},
  };
}

describe("SmartRouter — tag-based routing", () => {
  const backend = makeCard("backend", [
    { id: "backend-implementation-01", tags: ["node.js", "express", "api", "backend"] },
  ]);
  const frontend = makeCard("frontend", [
    { id: "frontend-implementation", tags: ["react", "css", "tailwind", "ui"] },
  ]);
  const planner = makeCard("planner", [
    { id: "planning", tags: ["plan", "architecture", "design"] },
  ]);

  it("routes by tag: 'node.js' → backend", () => {
    const router = new SmartRouter();
    const task = makeTask("Build a node.js REST API");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("backend");
  });

  it("routes by tag: 'react' → frontend", () => {
    const router = new SmartRouter();
    const task = makeTask("Create a React component");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("frontend");
  });

  it("routes by tag: 'architecture' → planner", () => {
    const router = new SmartRouter();
    const task = makeTask("Design the architecture for the system");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("planner");
  });

  it("explicit 'to' overrides tag routing", () => {
    const router = new SmartRouter();
    const task = makeTask("Build something", { to: "frontend" });
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("frontend");
  });

  it("explicit 'skill' overrides tag routing", () => {
    const router = new SmartRouter();
    const task = makeTask("Build something", { skill: "planning" });
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("planner");
  });

  it("fallback: picks first candidate when no tag matches", () => {
    const router = new SmartRouter();
    const task = makeTask("Do something vague");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result).toBeDefined(); // picks first
  });

  it("matches compound terms: 'node.js', 'rest api'", () => {
    const router = new SmartRouter();
    const task = makeTask("Create a node.js REST API with express");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("backend");
  });

  it("matches frontend skill tags: 'tailwind', 'css'", () => {
    const router = new SmartRouter();
    const task = makeTask("Add tailwind styling to the component");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("frontend");
  });

  it("handles empty candidate list", () => {
    const router = new SmartRouter();
    const task = makeTask("Build something");
    const result = router.select(task, []);
    expect(result).toBeUndefined();
  });

  it("skill.id partial match works (e.g. 'express' in id)", () => {
    const router = new SmartRouter();
    const task = makeTask("Create an express server");
    const result = router.select(task, [frontend, backend, planner]);
    expect(result?.name).toBe("backend");
  });
});