/**
 * PiPal-A2A Layer 2 Tests — Shared State
 *
 * karpathy-clean-code: Infrastructure tests with real HTTP.
 * SharedStateServer starts on a random port, SharedStateClient calls real endpoints.
 * No mocks — real fetch, real Express, real SSE.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createAgentCard,
  createSkill,
  type AgentCard,
} from "../src/core/types.js";
import { SharedStateServer, SharedStateClient, type StoredTask } from "../src/infrastructure/shared-state.js";

let server: SharedStateServer;
let client: SharedStateClient;
let baseUrl: string;
const PORT = 18001;

beforeAll(async () => {
  server = new SharedStateServer();
  baseUrl = await server.start(PORT);
  client = new SharedStateClient(baseUrl);
});

afterAll(async () => {
  await server.stop();
});

function makeCard(name: string, skillIds: string[]): AgentCard {
  return createAgentCard(
    name,
    baseUrl,
    skillIds.map((id) => createSkill(id, id, `Skill: ${id}`)),
    { description: `Test agent: ${name}` },
  );
}

describe("SharedStateServer + Client", () => {
  it("health check returns ok", async () => {
    const reachable = await client.isReachable();
    expect(reachable).toBe(true);
  });

  it("registers an agent", async () => {
    const card = makeCard("planner", ["planning"]);
    await client.register(card);

    const agents = await client.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("planner");
  });

  it("registers multiple agents", async () => {
    await client.register(makeCard("backend", ["code-generation"]));

    const agents = await client.listAgents();
    expect(agents).toHaveLength(2);
    const names = agents.map((a) => a.name);
    expect(names).toContain("planner");
    expect(names).toContain("backend");
  });

  it("unregisters an agent", async () => {
    await client.unregister("backend");

    const agents = await client.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("planner");
  });

  it("creates a task and retrieves it", async () => {
    const taskId = await client.createTask({
      from: "planner",
      to: "backend",
      task: "Build login API",
    });

    expect(taskId).toBeTruthy();

    const task = await client.getTask(taskId);
    expect(task.id).toBe(taskId);
    expect(task.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(task.fromAgent).toBe("planner");
    expect(task.toAgent).toBe("backend");
    expect(task.taskDescription).toBe("Build login API");
  });

  it("posts a result and retrieves completed task", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Review code",
    });

    await client.postResult(taskId, "Code looks good!");

    const task = await client.getTask(taskId);
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts![0].parts[0].text).toBe("Code looks good!");
  });

  it("posts an error and retrieves failed task", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Do impossible thing",
    });

    await client.postError(taskId, "Not enough compute");

    const task = await client.getTask(taskId);
    expect(task.status.state).toBe("TASK_STATE_FAILED");
    expect(task.metadata?.error).toBe("Not enough compute");
  });

  it("rejects task without task description", async () => {
    await expect(
      client.createTask({ from: "planner", task: "" }),
    ).rejects.toThrow();
  });

  it("task timestamps are ISO 8601", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Timestamp test",
    });

    const task = await client.getTask(taskId);
    expect(task.status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});