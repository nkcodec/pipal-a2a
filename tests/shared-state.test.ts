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

  it("waitForResult resolves via SSE stream", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "SSE wait test",
    });

    // Start waiting first, then post result — SSE delivers the event and
    // waitForResult resolves without polling. Post result before waiting
    // to exercise the SSE-fast-path.
    await client.postResult(taskId, "SSE worked!");
    const task = await client.waitForResult(taskId, { timeout: 10_000 });
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts![0].parts[0].text).toBe("SSE worked!");
  }, 15_000);

  it("subscribeToTask receives streaming events", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Subscribe test",
    });

    const events = [];
    const unsub = client.subscribeToTask(taskId, (event, data) => {
      events.push([event, data]);
    });

    await new Promise((r) => setTimeout(r, 300));
    await client.postResult(taskId, "Subscribed result");
    await new Promise((r) => setTimeout(r, 500));
    unsub();

    expect(events.some(([e]) => e === "task_completed")).toBe(true);
    const completed = events.find(([e]) => e === "task_completed");
    expect(completed).toBeTruthy();
    expect(completed![1].result).toBe("Subscribed result");
  }, 10_000);

  it("streamChunk broadcasts artifact_update events via SSE", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Stream chunk test",
    });

    const events: [string, unknown][] = [];
    const unsub = client.subscribeToTask(taskId, (event, data) => {
      events.push([event, data]);
    });

    await new Promise((r) => setTimeout(r, 200));

    // Stream some chunks
    await client.streamChunk(taskId, "Hello ");
    await client.streamChunk(taskId, "World!");

    await new Promise((r) => setTimeout(r, 300));
    unsub();

    const artifactUpdates = events.filter(([e]) => e === "artifact_update");
    expect(artifactUpdates.length).toBeGreaterThanOrEqual(2);
    expect((artifactUpdates[0][1] as any).chunk).toBe("Hello ");
    expect((artifactUpdates[1][1] as any).chunk).toBe("World!");
  }, 10_000);

  it("createTask assigns a contextId", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "ContextId test",
    });
    const task = await client.getTask(taskId);
    expect(task.contextId).toBeTruthy();
  });

  it("createTask preserves explicit contextId", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Explicit context",
      contextId: "my-custom-context",
    });
    const task = await client.getTask(taskId);
    expect(task.contextId).toBe("my-custom-context");
  });

  it("sendFollowUp appends message to task history", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Multi-turn test",
    });
    const updated = await client.sendFollowUp(taskId, "Need more details", {
      role: "ROLE_AGENT",
      requireInput: true,
    });
    expect(updated.history).toHaveLength(1);
    expect(updated.history![0].role).toBe("ROLE_AGENT");
    expect(updated.history![0].parts[0].text).toBe("Need more details");
    expect(updated.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
  });

  it("sendFollowUp with user response restores working state", async () => {
    const taskId = await client.createTask({
      from: "planner",
      task: "Multi-turn response",
    });
    await client.sendFollowUp(taskId, "What file?", { role: "ROLE_AGENT", requireInput: true });
    const resolved = await client.sendFollowUp(taskId, "test.txt", { role: "ROLE_USER" });
    expect(resolved.history).toHaveLength(2);
    expect(resolved.history![1].role).toBe("ROLE_USER");
    // State returns to SUBMITTED (not INPUT_REQUIRED) since requireInput is false
    expect(resolved.status.state).not.toBe("TASK_STATE_INPUT_REQUIRED");
  });
});