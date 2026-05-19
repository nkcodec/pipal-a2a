/**
 * PiPal-A2A Layer 2 Tests — Registry
 * 
 * karpathy-clean-code: Application tests with stubs (not mocks).
 * Tests InMemoryAgentRegistry with real AgentCard objects.
 */

import { describe, it, expect } from "vitest";
import { 
  createAgentCard, 
  createSkill, 
  type AgentCard,
} from "../src/core/types.js";
import { InMemoryAgentRegistry } from "../src/application/registry.js";

function makeCard(name: string, skillIds: string[]): AgentCard {
  return createAgentCard(
    name,
    "http://localhost:5000",
    skillIds.map(id => createSkill(id, id, `Skill: ${id}`)),
    { description: `Agent: ${name}` }
  );
}

describe("InMemoryAgentRegistry", () => {
  it("registers and retrieves agents", () => {
    const registry = new InMemoryAgentRegistry();
    const card = makeCard("planner", ["planning"]);
    
    registry.register(card);
    
    expect(registry.get("planner")).toBe(card);
    expect(registry.list()).toHaveLength(1);
  });

  it("unregisters agents", () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    
    registry.unregister("planner");
    
    expect(registry.get("planner")).toBeUndefined();
    expect(registry.list()).toHaveLength(0);
  });

  it("finds agents by skill", () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning", "delegation"]));
    registry.register(makeCard("backend", ["code-generation", "backend"]));
    registry.register(makeCard("reviewer", ["security-review"]));
    
    const result = registry.findBySkill("code-generation");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("backend");
  });

  it("finds multiple agents with same skill", () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("backend-a", ["code-generation"]));
    registry.register(makeCard("backend-b", ["code-generation"]));
    
    const result = registry.findBySkill("code-generation");
    expect(result).toHaveLength(2);
  });

  it("returns empty for unknown skill", () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("planner", ["planning"]));
    
    expect(registry.findBySkill("nonexistent")).toHaveLength(0);
  });

  it("replaces card on re-register", () => {
    const registry = new InMemoryAgentRegistry();
    registry.register(makeCard("agent", ["v1"]));
    registry.register(makeCard("agent", ["v2"]));
    
    const card = registry.get("agent")!;
    expect(card.skills.map(s => s.id)).toEqual(["v2"]);
    expect(registry.list()).toHaveLength(1);
  });
});
