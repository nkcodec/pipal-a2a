/**
 * Test: Task adoption on session restart
 *
 * Verifies that orphaned tasks (from previous session crash/timeout)
 * are recovered when a new session starts.
 *
 * Bug: pipal-a2a PR #27
 * When pi restarts (compaction, crash, API timeout), in-flight
 * waitForTaskCompletion promises are destroyed. Tasks become orphaned.
 * Fix: session_start queries for active tasks from this agent and
 * re-subscribes via adoptOrphanedTask.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import type { AgentCard } from "../src/core/types.js";

function uniquePort() {
  return 48000 + Math.floor(Math.random() * 1000);
}

function makeClient(name: string, port: number) {
  const client = new SharedStateClient(`http://127.0.0.1:${port}`, undefined, name);
  const card: AgentCard = {
    name,
    description: `Test agent: ${name}`,
    url: `http://127.0.0.1:${port}`,
    capabilities: [],
    tags: [name],
    protocolVersion: "1.0",
  };
  return { client, card };
}

describe("Task Adoption on Reconnect", () => {
  let server: SharedStateServer;
  let port: number;

  beforeEach(async () => {
    port = uniquePort();
    server = new SharedStateServer({ dbPath: ":memory:" });
    await server.start(port, "127.0.0.1");
  });

  afterEach(async () => {
    await server.stop();
  });

  it("orphaned task is visible to new session via listTasks", async () => {
    const { client: planner, card: plannerCard } = makeClient("planner", port);
    const { client: scalaDev, card: scalaCard } = makeClient("scala-dev", port);

    await planner.register(plannerCard);
    await scalaDev.register(scalaCard);

    const taskId = await planner.createTask({
      from: "planner",
      to: "scala-dev",
      task: "Implement Blackboard.scala actor",
    });

    // Verify task exists
    const created = await planner.getTask(taskId);
    expect(created.status.state).toBe("TASK_STATE_SUBMITTED");

    // Phase 2: planner "crashes" — just query from a new client

    // Phase 3: new planner session queries for orphaned tasks
    const { client: newPlanner, card: newCard } = makeClient("planner", port);
    await newPlanner.register(newCard);

    // The adoption query — same logic as in extension/index.ts
    const allTasks = await newPlanner.listTasks();
    const activeStates = ["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING", "TASK_STATE_INPUT_REQUIRED"];
    const myOrphans = allTasks.filter(
      (t: any) => t.fromAgent === "planner" && activeStates.includes(t.status?.state)
    );

    expect(myOrphans.length).toBe(1);
    expect(myOrphans[0].id).toBe(taskId);

    // Phase 4: scala-dev completes the task
    await scalaDev.postResult(taskId, "Blackboard.scala created with 5 methods");

    // Phase 5: new planner can still get the result
    const completed = await newPlanner.getTask(taskId);
    expect(completed.status.state).toBe("TASK_STATE_COMPLETED");
    expect(completed.artifacts?.[0]?.parts?.[0]?.text).toBe("Blackboard.scala created with 5 methods");
  });

  it("completed tasks are NOT treated as orphans", async () => {
    const { client: planner, card: plannerCard } = makeClient("planner", port);
    const { client: scalaDev, card: scalaCard } = makeClient("scala-dev", port);

    await planner.register(plannerCard);
    await scalaDev.register(scalaCard);

    const taskId = await planner.createTask({
      from: "planner",
      to: "scala-dev",
      task: "Quick task",
    });

    // Task completes before planner crashes
    await scalaDev.postResult(taskId, "Done");

    // New session queries for orphans
    const allTasks = await planner.listTasks();
    const activeStates = ["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING", "TASK_STATE_INPUT_REQUIRED"];
    const myOrphans = allTasks.filter(
      (t: any) => t.fromAgent === "planner" && activeStates.includes(t.status?.state)
    );

    expect(myOrphans.length).toBe(0);
  });

  it("tasks from OTHER agents are NOT adopted", async () => {
    const { client: planner, card: plannerCard } = makeClient("planner", port);
    const { client: reviewer, card: reviewerCard } = makeClient("reviewer", port);
    const { client: scalaDev, card: scalaCard } = makeClient("scala-dev", port);

    await planner.register(plannerCard);
    await reviewer.register(reviewerCard);
    await scalaDev.register(scalaCard);

    // reviewer creates a task (not planner)
    await reviewer.createTask({
      from: "reviewer",
      to: "scala-dev",
      task: "Review auth module",
    });

    // Planner queries for orphans — should find zero (task is from reviewer)
    const allTasks = await planner.listTasks();
    const activeStates = ["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING", "TASK_STATE_INPUT_REQUIRED"];
    const myOrphans = allTasks.filter(
      (t: any) => t.fromAgent === "planner" && activeStates.includes(t.status?.state)
    );

    expect(myOrphans.length).toBe(0);
  });
});
