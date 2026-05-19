/**
 * v0.1.7 — PIPAL_TAGS tests
 * 
 * Verify tags flow from config → AgentCard → SmartRouter
 */

import { describe, it, expect } from "vitest";
import { SmartRouter } from "../src/builtin/smart-router.js";
import type { Task } from "../src/core/types.js";

function makeTask(text: string): Task {
  return {
    id: "test",
    status: { state: "TASK_STATE_SUBMITTED", timestamp: new Date().toISOString() },
    history: [{
      messageId: "m1",
      role: "ROLE_USER",
      parts: [{ text }],
    }],
    metadata: {},
  };
}

describe("SmartRouter — PIPAL_TAGS integration", () => {
  // Simulate agents with tags (as if set via PIPAL_TAGS)
  const agents = [
    {
      name: "backend",
      skills: [{
        id: "code-generation",
        name: "code-generation",
        description: "",
        tags: ["node.js", "express", "api", "backend"] as readonly string[],
      }],
    },
    {
      name: "frontend",
      skills: [{
        id: "frontend-implementation",
        name: "frontend-implementation",
        description: "",
        tags: ["react", "css", "tailwind", "ui"] as readonly string[],
      }],
    },
    {
      name: "planner",
      skills: [{
        id: "planning",
        name: "planning",
        description: "",
        tags: ["plan", "architecture", "design"] as readonly string[],
      }],
    },
  ];

  const router = new SmartRouter();

  it("routes node.js task to backend", () => {
    const task = makeTask("Build a node.js REST API");
    const result = router.select(task, agents as any);
    expect(result?.name).toBe("backend");
  });

  it("routes react task to frontend", () => {
    const task = makeTask("Create a React component with CSS");
    const result = router.select(task, agents as any);
    expect(result?.name).toBe("frontend");
  });

  it("routes architecture task to planner", () => {
    const task = makeTask("Design the architecture for the app");
    const result = router.select(task, agents as any);
    expect(result?.name).toBe("planner");
  });

  it("routes full-stack task — 'node.js + react' matches backend first", () => {
    const task = makeTask("Build a full-stack app with node.js backend and react frontend");
    const result = router.select(task, agents as any);
    // node.js matches first → backend
    expect(result?.name).toBe("backend");
  });

  it("handles compound terms: 'express.js'", () => {
    const task = makeTask("Create an express.js server");
    const result = router.select(task, agents as any);
    expect(result?.name).toBe("backend");
  });

  it("handles compound terms: 'tailwindcss' (no dot)", () => {
    const task = makeTask("Add tailwindcss styling");
    const result = router.select(task, agents as any);
    expect(result?.name).toBe("frontend");
  });
});