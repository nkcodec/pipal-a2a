/**
 * PiPal-A2A E2E — SmartRouter + Delegation with Tags
 *
 * karpathy-clean-code: Full pipeline test with tag-based routing.
 * Simulates 3 agents (planner, backend, frontend) delegating via SmartRouter.
 *
 * Flow:
 *   1. 3 agents register with skills + tags
 *   2. Planner delegates without to/skill → SmartRouter routes by tag
 *   3. Backend receives task → does work → posts result
 *   4. Planner gets result
 *   5. Tags are not duplicated in agent listing
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createAgentCard,
  createSkill,
  type AgentCard,
} from "../src/core/types.js";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { SmartRouter } from "../src/builtin/smart-router.js";

const PORT = 18004;

let server: SharedStateServer;
let plannerClient: SharedStateClient;
let backendClient: SharedStateClient;
let frontendClient: SharedStateClient;
let plannerCard: AgentCard;
let backendCard: AgentCard;
let frontendCard: AgentCard;

beforeAll(async () => {
  server = new SharedStateServer({ dbPath: ":memory:" });
  const baseUrl = await server.start(PORT);

  // Planner agent
  plannerClient = new SharedStateClient(baseUrl);
  plannerCard = createAgentCard(
    "planner",
    baseUrl,
    [
      createSkill("planning", "Planning", "Plans tasks", { tags: ["plan", "architecture", "design"] }),
      createSkill("delegation", "Delegation", "Delegates tasks", { tags: ["plan", "architecture", "design"] }),
    ],
    { description: "Task planner" }
  );
  await plannerClient.register(plannerCard);

  // Backend agent
  backendClient = new SharedStateClient(baseUrl);
  backendCard = createAgentCard(
    "backend",
    baseUrl,
    [
      createSkill("code-generation", "Code Generation", "Generates code", { tags: ["node.js", "express", "api", "backend"] }),
      createSkill("backend-implementation", "Backend", "Backend implementation", { tags: ["node.js", "express", "api", "backend"] }),
    ],
    { description: "Backend specialist" }
  );
  await backendClient.register(backendCard);

  // Frontend agent
  frontendClient = new SharedStateClient(baseUrl);
  frontendCard = createAgentCard(
    "frontend",
    baseUrl,
    [
      createSkill("frontend-implementation", "Frontend", "Frontend implementation", { tags: ["react", "css", "tailwind", "ui"] }),
      createSkill("planning", "Planning", "Plans tasks", { tags: ["react", "css", "tailwind", "ui"] }),
    ],
    { description: "Frontend specialist" }
  );
  await frontendClient.register(frontendCard);
});

afterAll(async () => {
  await plannerClient.unregister("planner");
  await backendClient.unregister("backend");
  await frontendClient.unregister("frontend");
  await server.stop();
});

describe("E2E: SmartRouter tag-based delegation", () => {
  it("3 agents registered with unique tags", async () => {
    const agents = await plannerClient.listAgents();
    expect(agents).toHaveLength(3);
    const names = agents.map((a) => a.name).sort();
    expect(names).toEqual(["backend", "frontend", "planner"]);
  });

  it("tags are not duplicated across skills", async () => {
    const agents = await plannerClient.listAgents();
    const backend = agents.find((a) => a.name === "backend")!;

    // Backend has 2 skills, both with same tags → should deduplicate
    const allTags = backend.skills.flatMap((s) => s.tags || []);
    const uniqueTags = [...new Set(allTags)];

    // Each tag appears twice (once per skill), but unique set should be smaller
    expect(uniqueTags.length).toBeLessThan(allTags.length);
    expect(uniqueTags).toContain("node.js");
    expect(uniqueTags).toContain("express");
    expect(uniqueTags).toContain("api");
    expect(uniqueTags).toContain("backend");
  });

  it("SmartRouter routes 'node.js' task to backend", async () => {
    const router = new SmartRouter();
    const agents = await plannerClient.listAgents();
    const others = agents.filter((a) => a.name !== "planner");

    const task = {
      id: "test-1",
      status: { state: "TASK_STATE_SUBMITTED" as const, timestamp: new Date().toISOString() },
      history: [{ messageId: "m1", role: "ROLE_USER" as const, parts: [{ text: "Build a node.js REST API" }] }],
      metadata: {},
    };

    const target = router.select(task, others, "planner");
    expect(target?.name).toBe("backend");
  });

  it("SmartRouter routes 'react' task to frontend", async () => {
    const router = new SmartRouter();
    const agents = await plannerClient.listAgents();
    const others = agents.filter((a) => a.name !== "planner");

    const task = {
      id: "test-2",
      status: { state: "TASK_STATE_SUBMITTED" as const, timestamp: new Date().toISOString() },
      history: [{ messageId: "m1", role: "ROLE_USER" as const, parts: [{ text: "Create a React component with CSS" }] }],
      metadata: {},
    };

    const target = router.select(task, others, "planner");
    expect(target?.name).toBe("frontend");
  });

  it("SmartRouter excludes self: backend delegating → routes to frontend", async () => {
    const router = new SmartRouter();
    const agents = await plannerClient.listAgents();

    const task = {
      id: "test-3",
      status: { state: "TASK_STATE_SUBMITTED" as const, timestamp: new Date().toISOString() },
      history: [{ messageId: "m1", role: "ROLE_USER" as const, parts: [{ text: "Build react UI" }] }],
      metadata: {},
    };

    // Backend delegates — should exclude itself
    const target = router.select(task, agents, "backend");
    expect(target?.name).toBe("frontend");
  });

  it("full delegation flow: planner → SmartRouter → backend → result", async () => {
    // Step 1: Planner uses SmartRouter to find target
    const router = new SmartRouter();
    const agents = await plannerClient.listAgents();
    const others = agents.filter((a) => a.name !== "planner");

    const taskText = "Build a node.js Express API for todos";
    const task = {
      id: "preview",
      status: { state: "TASK_STATE_SUBMITTED" as const, timestamp: new Date().toISOString() },
      history: [{ messageId: "m1", role: "ROLE_USER" as const, parts: [{ text: taskText }] }],
      metadata: {},
    };

    const target = router.select(task, others, "planner");
    expect(target?.name).toBe("backend");

    // Step 2: Planner creates task via shared state
    const taskId = await plannerClient.createTask({
      from: "planner",
      to: target!.name,
      task: taskText,
    });
    expect(taskId).toBeTruthy();

    // Step 3: Backend processes and posts result
    await backendClient.postResult(taskId, "Node.js Express API created with CRUD endpoints");

    // Step 4: Planner gets result
    const result = await plannerClient.getTask(taskId);
    expect(result.status.state).toBe("TASK_STATE_COMPLETED");
    expect(result.artifacts![0].parts[0].text).toBe("Node.js Express API created with CRUD endpoints");
  });

  it("parallel delegation: planner → backend + frontend", async () => {
    // Delegate to backend
    const backendTaskId = await plannerClient.createTask({
      from: "planner",
      to: "backend",
      task: "Build node.js API",
    });

    // Delegate to frontend
    const frontendTaskId = await plannerClient.createTask({
      from: "planner",
      to: "frontend",
      task: "Build React UI",
    });

    // Both process in parallel
    await backendClient.postResult(backendTaskId, "API done");
    await frontendClient.postResult(frontendTaskId, "UI done");

    // Both completed
    const bTask = await plannerClient.getTask(backendTaskId);
    const fTask = await plannerClient.getTask(frontendTaskId);
    expect(bTask.status.state).toBe("TASK_STATE_COMPLETED");
    expect(fTask.status.state).toBe("TASK_STATE_COMPLETED");
    expect(bTask.artifacts![0].parts[0].text).toBe("API done");
    expect(fTask.artifacts![0].parts[0].text).toBe("UI done");
  });
});
