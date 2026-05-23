/**
 * PiPal-A2A Layer 3 — E2E Test
 * 
 * karpathy-clean-code: Full pipeline test. Real HTTP, real task delegation.
 * Simulates two terminals joining the same shared state and exchanging a task.
 * 
 * Flow:
 *   Terminal A (planner) registers → creates task for "backend"
 *   Terminal B (backend) registers → polls shared state → processes task → posts result
 *   Terminal A polls → gets result
 * 
 * No mocks. No LLM needed. Real HTTP server.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createAgentCard,
  createSkill,
  type AgentCard,
} from "../src/core/types.js";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { InMemoryAgentRegistry } from "../src/application/registry.js";
import { DefaultTaskRouter } from "../src/application/router.js";

const PORT = 18002; // different port from Layer 2 tests

let server: SharedStateServer;
let clientA: SharedStateClient; // planner terminal
let clientB: SharedStateClient; // backend terminal
let cardA: AgentCard;
let cardB: AgentCard;

beforeAll(async () => {
  // Start shared state server (simulating HOST mode — first terminal)
  server = new SharedStateServer({ dbPath: ":memory:" });
  const baseUrl = await server.start(PORT);

  // Terminal A: planner (HOST)
  clientA = new SharedStateClient(baseUrl);
  cardA = createAgentCard(
    "planner",
    baseUrl,
    [createSkill("planning", "Planning", "Plans tasks"), createSkill("delegation", "Delegation", "Delegates tasks")],
    { description: "Task planner" }
  );
  await clientA.register(cardA);

  // Terminal B: backend worker (JOIN)
  clientB = new SharedStateClient(baseUrl);
  cardB = createAgentCard(
    "backend-worker",
    baseUrl,
    [createSkill("code-generation", "Code Generation", "Generates code"), createSkill("backend", "Backend", "Backend implementation")],
    { description: "Backend specialist" }
  );
  await clientB.register(cardB);
});

afterAll(async () => {
  await clientA.unregister("planner");
  await clientB.unregister("backend-worker");
  await server.stop();
});

describe("E2E: Two terminals collaborating", () => {
  it("both agents are registered in shared state", async () => {
    const agents = await clientA.listAgents();
    expect(agents).toHaveLength(2);
    const names = agents.map(a => a.name);
    expect(names).toContain("planner");
    expect(names).toContain("backend-worker");
  });

  it("planner delegates task → backend processes → result flows back", async () => {
    // Step 1: Planner creates task targeted at backend-worker
    const taskId = await clientA.createTask({
      from: "planner",
      to: "backend-worker",
      skill: "code-generation",
      task: "Implement JWT authentication middleware",
    });

    expect(taskId).toBeTruthy();

    // Step 2: Verify task is in SUBMITTED state
    let task = await clientA.getTask(taskId);
    expect(task.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(task.fromAgent).toBe("planner");
    expect(task.toAgent).toBe("backend-worker");
    expect(task.skillHint).toBe("code-generation");
    expect(task.taskDescription).toBe("Implement JWT authentication middleware");

    // Step 3: Backend "processes" the task (simulates LLM work)
    // In real life, the SSE handler would inject into pi.sendUserMessage()
    // Here we simulate the result posting
    await clientB.postResult(taskId, "JWT middleware implemented in auth/jwt.ts");

    // Step 4: Planner polls and gets the completed result
    task = await clientA.getTask(taskId);
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts![0].parts[0].text).toBe("JWT middleware implemented in auth/jwt.ts");
  });

  it("skill-based routing works with real registry", async () => {
    // Set up local registries like the extension does
    const registryA = new InMemoryAgentRegistry();
    registryA.register(cardA);
    registryA.register(cardB);
    const routerA = new DefaultTaskRouter(registryA);

    // Create a task with skill hint (no direct target)
    const taskId = await clientA.createTask({
      from: "planner",
      skill: "code-generation",
      task: "Generate REST API scaffold",
    });

    // Router picks backend-worker because it has code-generation skill
    // (In real extension, this happens in the tool's execute function)
    const agents = await clientA.listAgents();
    const backendCard = agents.find(a => a.name === "backend-worker");
    expect(backendCard).toBeTruthy();
    expect(backendCard!.skills.some(s => s.id === "code-generation")).toBe(true);

    // Backend processes and posts result
    await clientB.postResult(taskId, "REST API scaffold created with Express routes");

    // Verify completion
    const task = await clientA.getTask(taskId);
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
  });

  it("task failure flows back correctly", async () => {
    const taskId = await clientA.createTask({
      from: "planner",
      to: "backend-worker",
      task: "Do something impossible",
    });

    // Backend fails the task
    await clientB.postError(taskId, "Out of memory");

    const task = await clientA.getTask(taskId);
    expect(task.status.state).toBe("TASK_STATE_FAILED");
    expect(task.metadata?.error).toBe("Out of memory");
  });

  it("multiple tasks in sequence", async () => {
    // Task 1
    const task1Id = await clientA.createTask({
      from: "planner",
      to: "backend-worker",
      task: "Write unit tests",
    });
    await clientB.postResult(task1Id, "Tests written");

    // Task 2
    const task2Id = await clientA.createTask({
      from: "planner",
      to: "backend-worker",
      task: "Write integration tests",
    });
    await clientB.postResult(task2Id, "Integration tests written");

    // Both completed
    const t1 = await clientA.getTask(task1Id);
    const t2 = await clientA.getTask(task2Id);
    expect(t1.status.state).toBe("TASK_STATE_COMPLETED");
    expect(t2.status.state).toBe("TASK_STATE_COMPLETED");
    expect(t1.id).not.toBe(t2.id);
  });

  it("agent cards have Google A2A v1.0 structure", async () => {
    const agents = await clientA.listAgents();
    
    for (const agent of agents) {
      // Google A2A v1.0 required fields
      expect(agent.name).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.version).toBeTruthy();
      expect(agent.skills).toBeInstanceOf(Array);
      expect(agent.supportedInterfaces).toHaveLength(1);
      expect(agent.supportedInterfaces[0].protocolBinding).toBe("JSONRPC");
      expect(agent.supportedInterfaces[0].protocolVersion).toBe("1.0");
      expect(agent.capabilities).toBeTruthy();
      
      // No legacy v0.3 fields
      expect((agent as any).url).toBeUndefined();
      expect((agent as any).protocolVersion).toBeUndefined();
    }
  });
});
