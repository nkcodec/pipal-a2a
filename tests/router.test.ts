/**
 * PiPal-A2A Layer 2 Tests — Router
 * 
 * karpathy-clean-code: Application tests with stubs (not mocks).
 * Tests DefaultTaskRouter and SkillMatcher with real objects.
 */

import { describe, it, expect } from "vitest";
import { 
  createAgentCard, 
  createSkill, 
  createTask,
  type AgentCard,
  type Task,
} from "../src/core/types.js";
import { DefaultTaskRouter } from "../src/application/router.js";
import { InMemoryAgentRegistry } from "../src/application/registry.js";
import { SkillMatcher } from "../src/builtin/skill-matcher.js";

function makeCard(name: string, skillIds: string[]): AgentCard {
  return createAgentCard(
    name,
    `http://localhost:5000`,
    skillIds.map(id => createSkill(id, id, `Skill: ${id}`)),
    { description: `Agent: ${name}` }
  );
}

function makeRoutingTask(options: { skill?: string; to?: string }): Task {
  return createTask(crypto.randomUUID(), "TASK_STATE_SUBMITTED", {
    metadata: { 
      skill: options.skill, 
      to: options.to 
    },
  });
}

describe("SkillMatcher", () => {
  it("matches task to agent with required skill", () => {
    const matcher = new SkillMatcher();
    const task = makeRoutingTask({ skill: "code-generation" });
    const candidates = [
      makeCard("planner", ["planning"]),
      makeCard("backend", ["code-generation"]),
    ];
    
    const result = matcher.select(task, candidates);
    expect(result?.name).toBe("backend");
  });

  it("returns first candidate when no skill hint", () => {
    const matcher = new SkillMatcher();
    const task = makeRoutingTask({});
    const candidates = [
      makeCard("planner", ["planning"]),
      makeCard("backend", ["code-generation"]),
    ];
    
    const result = matcher.select(task, candidates);
    expect(result?.name).toBe("planner");
  });

  it("returns undefined for empty candidates", () => {
    const matcher = new SkillMatcher();
    const task = makeRoutingTask({ skill: "planning" });
    
    expect(matcher.select(task, [])).toBeUndefined();
  });

  it("returns undefined when no candidate has required skill", () => {
    const matcher = new SkillMatcher();
    const task = makeRoutingTask({ skill: "nonexistent" });
    const candidates = [makeCard("planner", ["planning"])];
    
    expect(matcher.select(task, candidates)).toBeUndefined();
  });
});

describe("DefaultTaskRouter", () => {
  it("routes by direct agent name", async () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    registry.register(makeCard("backend", ["code-generation"]));
    const router = new DefaultTaskRouter(registry);
    
    const task = makeRoutingTask({ to: "backend" });
    const target = await router.route(task);
    
    expect(target?.name).toBe("backend");
  });

  it("routes by skill hint", async () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    registry.register(makeCard("backend", ["code-generation"]));
    registry.register(makeCard("reviewer", ["security-review"]));
    const router = new DefaultTaskRouter(registry);
    
    const task = makeRoutingTask({ skill: "security-review" });
    const target = await router.route(task);
    
    expect(target?.name).toBe("reviewer");
  });

  it("returns undefined when no agent matches", async () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    const router = new DefaultTaskRouter(registry);
    
    const task = makeRoutingTask({ skill: "nonexistent" });
    const target = await router.route(task);
    
    expect(target).toBeUndefined();
  });

  it("falls back to any agent when no skill or target", async () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    const router = new DefaultTaskRouter(registry);
    
    const task = makeRoutingTask({});
    const target = await router.route(task);
    
    expect(target?.name).toBe("planner");
  });

  it("returns undefined when registry is empty", async () => {
    const registry = new InMemoryAgentRegistry();
    const router = new DefaultTaskRouter(registry);
    
    const task = makeRoutingTask({ skill: "planning" });
    const target = await router.route(task);
    
    expect(target).toBeUndefined();
  });

  it("prefers direct name over skill hint", async () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    registry.register(makeCard("backend", ["code-generation"]));
    const router = new DefaultTaskRouter(registry);
    
    // skill says planning but to says backend
    const task = makeRoutingTask({ to: "backend", skill: "planning" });
    const target = await router.route(task);
    
    expect(target?.name).toBe("backend");
  });

  it("accepts custom routing strategy", async () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("backend-a", ["code-generation"]));
    registry.register(makeCard("backend-b", ["code-generation"]));
    const router = new DefaultTaskRouter(registry);

    // Custom strategy: always pick the last candidate
    router.setStrategy({
      priority: 99,
      select: (_task, candidates) => candidates[candidates.length - 1],
    });
    
    const task = makeRoutingTask({ skill: "code-generation" });
    const target = await router.route(task);
    
    expect(target?.name).toBe("backend-b");
  });
});
