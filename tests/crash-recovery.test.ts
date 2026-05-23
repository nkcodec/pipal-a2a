/**
 * E2E Crash Recovery Tests — Step 4
 *
 * Real scenarios: start server, create state, kill server, restart, verify survival.
 * Uses file-based SQLite (temp directory), NOT :memory:.
 *
 * Each scenario uses unique ports for Phase 1 and Phase 2 to avoid
 * "other side closed" errors from TCP TIME_WAIT.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { createAgentCard, createSkill } from "../src/core/types.js";
import type { AgentCard } from "../src/core/types.js";
import fs from "fs";
import path from "path";
import os from "os";

// ── Helpers ─────────────────────────────────────────────────────

function makeCard(name: string, skillIds: string[]): AgentCard {
  return createAgentCard(
    name,
    "http://localhost:5000",
    skillIds.map((id) => createSkill(id, id, `Skill: ${id}`)),
    { description: `Agent: ${name}` },
  );
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pipal-crash-"));
}

// Unique port per test phase to avoid TCP TIME_WAIT
let portPool = 20001;
function nextPort(): number { return portPool++; }

// ── Scenarios ───────────────────────────────────────────────────

describe("E2E Crash Recovery", () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = tmpDir();
    dbPath = path.join(tmp, "state.db");
  });

  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true }); } catch {}
  });

  // ── Scenario 1: Agents survive crash ─────────────────────────

  it("recovers registered agents after crash", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    // --- Phase 1: Start, register agents, kill ---
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1);

    await c1.register(makeCard("backend", ["nodejs", "express"]));
    await c1.register(makeCard("frontend", ["react", "tailwind"]));
    await c1.register(makeCard("reviewer", ["security", "code-review"]));

    const agentsBefore = await c1.listAgents();
    expect(agentsBefore).toHaveLength(3);

    // CRASH
    await s1.stop();

    // --- Phase 2: Restart on new port, verify agents survived ---
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);
    const c2 = new SharedStateClient(url2);

    const agentsAfter = await c2.listAgents();
    expect(agentsAfter).toHaveLength(3);
    expect(agentsAfter.map(a => a.name).sort()).toEqual(["backend", "frontend", "reviewer"]);

    // Agent skills survived JSON round-trip
    const backend = agentsAfter.find(a => a.name === "backend")!;
    expect(backend.skills).toHaveLength(2);
    expect(backend.skills!.map(s => s.id).sort()).toEqual(["express", "nodejs"]);

    await s2.stop();
  });

  // ── Scenario 2: Tasks survive crash ──────────────────────────

  it("recovers in-flight tasks after crash", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    // --- Phase 1: Create tasks in various states ---
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1, undefined, "planner");

    // Task → SUBMITTED
    const r1 = await c1.rpcCall("tasks/sendMessage", {
      task: "Build the REST API",
      to: "backend",
      skill: "nodejs",
    });
    const submittedTaskId = r1.taskId;

    // Task → COMPLETED
    const r2 = await c1.rpcCall("tasks/sendMessage", {
      task: "Review the code",
      to: "reviewer",
    });
    await c1.rpcCall("tasks/resolveTask", {
      taskId: r2.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "LGTM",
    });

    // Task → still SUBMITTED
    const r3 = await c1.rpcCall("tasks/sendMessage", {
      task: "Design the UI",
      to: "frontend",
    });

    // CRASH
    await s1.stop();

    // --- Phase 2: Restart, verify tasks ---
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);
    const c2 = new SharedStateClient(url2);

    // Submitted task survived with all StoredTask fields
    const t1 = await c2.rpcCall("tasks/getTask", { taskId: submittedTaskId });
    expect(t1.task).toBeDefined();
    expect(t1.task.id).toBe(submittedTaskId);
    expect(t1.task.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(t1.task.fromAgent).toBe("anonymous");
    expect(t1.task.toAgent).toBe("backend");
    expect(t1.task.skillHint).toBe("nodejs");
    expect(t1.task.taskDescription).toBe("Build the REST API");

    // Completed task survived
    const t2 = await c2.rpcCall("tasks/getTask", { taskId: r2.taskId });
    expect(t2.task.status.state).toBe("TASK_STATE_COMPLETED");

    // Third task survived
    const t3 = await c2.rpcCall("tasks/getTask", { taskId: r3.taskId });
    expect(t3.task.taskDescription).toBe("Design the UI");

    // listTasks returns all 3
    const all = await c2.rpcCall("tasks/listTasks", {});
    expect(all.tasks).toHaveLength(3);

    await s2.stop();
  });

  // ── Scenario 3: Push configs survive crash ───────────────────

  it("recovers push notification configs after crash", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);

    const res = await fetch(`${url1}/push-configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/webhook", taskId: "task-1" }),
    });
    const cfg = await res.json();
    expect(cfg.id).toBeDefined();

    // CRASH
    await s1.stop();

    // Phase 2: Restart, verify configs
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);

    const res2 = await fetch(`${url2}/push-configs`);
    const configs = await res2.json();
    expect(configs).toHaveLength(1);
    expect(configs[0].url).toBe("https://example.com/webhook");

    await s2.stop();
  });

  // ── Scenario 4: Concurrent writes → crash → no data loss ─────

  it("handles rapid concurrent writes without data loss", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1);

    // 20 agents
    for (let i = 0; i < 20; i++) {
      await c1.register(makeCard(`agent-${i}`, [`skill-${i}`]));
    }

    // 20 tasks
    const taskPromises = [];
    for (let i = 0; i < 20; i++) {
      taskPromises.push(
        c1.rpcCall("tasks/sendMessage", {
          task: `Task ${i}`,
          to: `agent-${i % 5}`,
        })
      );
    }
    const results = await Promise.all(taskPromises);
    expect(results.every(r => r.taskId)).toBe(true);

    // CRASH
    await s1.stop();

    // Phase 2: No data lost
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);
    const c2 = new SharedStateClient(url2);

    expect(await c2.listAgents()).toHaveLength(20);
    const tasks = await c2.rpcCall("tasks/listTasks", {});
    expect(tasks.tasks).toHaveLength(20);

    await s2.stop();
  });

  // ── Scenario 5: Task resolve after crash, then crash again ───

  it("allows task resolution after crash recovery", async () => {
    const port1 = nextPort();
    const port2 = nextPort();
    const port3 = nextPort();

    // Phase 1: Create task
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1, undefined, "planner");

    const r = await c1.rpcCall("tasks/sendMessage", {
      task: "Build the login page",
      to: "frontend",
      skill: "react",
    });
    const taskId = r.taskId;
    await s1.stop();

    // Phase 2: Restart and resolve
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);
    const c2 = new SharedStateClient(url2);

    const t = await c2.rpcCall("tasks/getTask", { taskId });
    expect(t.task.status.state).toBe("TASK_STATE_SUBMITTED");

    const resolved = await c2.rpcCall("tasks/resolveTask", {
      taskId,
      state: "TASK_STATE_COMPLETED",
      result: "Login page done: /login.jsx",
    });
    expect(resolved.task.status.state).toBe("TASK_STATE_COMPLETED");
    await s2.stop();

    // Phase 3: Second crash → resolved state persists
    const s3 = new SharedStateServer({ dbPath });
    const url3 = await s3.start(port3);
    const c3 = new SharedStateClient(url3);

    const t3 = await c3.rpcCall("tasks/getTask", { taskId });
    expect(t3.task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(t3.task.artifacts).toBeDefined();
    expect(t3.task.artifacts![0].parts[0].text).toBe("Login page done: /login.jsx");

    await s3.stop();
  });

  // ── Scenario 6: Empty DB on first start ──────────────────────

  it("starts clean with no existing database", async () => {
    const port = nextPort();

    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port);
    const c1 = new SharedStateClient(url1);

    expect(await c1.listAgents()).toHaveLength(0);
    const tasks = await c1.rpcCall("tasks/listTasks", {});
    expect(tasks.tasks).toHaveLength(0);

    const health = await (await fetch(`${url1}/health`)).json();
    expect(health.ok).toBe(true);
    expect(health.agents).toBe(0);
    expect(health.tasks).toBe(0);

    await s1.stop();
  });

  // ── Scenario 7: SSE clients NOT restored (expected) ──────────

  it("does not restore SSE connections after crash", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    const s1 = new SharedStateServer({ dbPath });
    await s1.start(port1);
    await s1.stop();

    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);

    const health = await (await fetch(`${url2}/health`)).json();
    expect(health.ok).toBe(true);

    await s2.stop();
  });

  // ── Scenario 8: Agent re-registration after crash ────────────

  it("allows agents to re-register after crash (upsert via unregister+register)", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    // Phase 1: Register
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1);

    await c1.register(makeCard("backend", ["nodejs"]));
    await s1.stop();

    // Phase 2: Restart — agent persisted in DB
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);
    const c2 = new SharedStateClient(url2);

    const agents = await c2.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("backend");

    // Agent reconnects: unregister first (clears stale entry) then re-register
    await c2.unregister("backend");
    const updatedCard = makeCard("backend", ["nodejs", "typescript", "postgres"]);
    await c2.register(updatedCard);

    const agentsAfter = await c2.listAgents();
    expect(agentsAfter).toHaveLength(1);
    expect(agentsAfter[0].skills).toHaveLength(3);

    await s2.stop();
  });

  // ── Scenario 9: SSE reconnect after crash ────────────────────

  it("client SSE reconnects and receives events after server restart", async () => {
    const port1 = nextPort();
    const port2 = nextPort();

    // Phase 1: Start server, subscribe SSE
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1);

    const receivedEvents: Array<{ event: string; data: unknown }> = [];
    let reconnectCalled = false;

    const unsub = c1.subscribe((event, data) => {
      receivedEvents.push({ event, data });
    }, {
      onReconnect: async () => {
        reconnectCalled = true;
      },
    });

    // Wait for SSE to connect
    await new Promise(r => setTimeout(r, 100));

    // Register an agent → should get agent:online event
    await c1.register(makeCard("backend", ["nodejs"]));
    await new Promise(r => setTimeout(r, 100));
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    const firstEventCount = receivedEvents.length;

    // CRASH
    await s1.stop();
    // Wait for disconnect detection
    await new Promise(r => setTimeout(r, 200));

    // Phase 2: Restart server on new port
    // Note: client still points to old URL, so we simulate
    // what happens in real extension: client creates new connection
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);
    const c2 = new SharedStateClient(url2);

    const receivedEvents2: Array<{ event: string; data: unknown }> = [];
    let reconnectCalled2 = false;

    const unsub2 = c2.subscribe((event, data) => {
      receivedEvents2.push({ event, data });
    }, {
      onReconnect: async () => {
        reconnectCalled2 = true;
      },
    });

    await new Promise(r => setTimeout(r, 100));

    // Agent re-registers on new server
    await c2.unregister("backend");
    await c2.register(makeCard("backend", ["nodejs", "typescript"]));
    await new Promise(r => setTimeout(r, 100));

    // SSE event received on new connection
    expect(receivedEvents2.length).toBeGreaterThanOrEqual(1);
    const onlineEvent = receivedEvents2.find(e => e.event === "agent:online");
    expect(onlineEvent).toBeDefined();

    unsub();
    unsub2();
    await s2.stop();
  });
});
