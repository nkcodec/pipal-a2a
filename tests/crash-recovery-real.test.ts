/**
 * Real-World Multi-Agent Crash Recovery Test
 *
 * Simulates the actual agent workflow:
 *   1. Planner starts HOST server
 *   2. Backend agent connects + registers
 *   3. Planner delegates task to backend
 *   4. Backend picks up task via SSE event
 *   5. CRASH — server killed
 *   6. Server restarts on new port
 *   7. Backend reconnects + re-registers
 *   8. Backend resolves the task
 *   9. Planner gets result
 *
 * This is as close to real pi terminals as we can get without spawning processes.
 */

import { describe, it, expect, afterEach } from "vitest";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { createAgentCard, createSkill } from "../src/core/types.js";
import type { AgentCard } from "../src/core/types.js";
import fs from "fs";
import path from "path";
import os from "os";

// ── Helpers ─────────────────────────────────────────────────────

function makeCard(name: string, skillIds: string[], tags: string[] = []): AgentCard {
  return createAgentCard(
    name,
    "http://localhost:5000",
    skillIds.map((id) => createSkill(id, id, `Skill: ${id}`, { tags })),
    { description: `Agent: ${name}` },
  );
}

let portPool = 30001;
function nextPort(): number { return portPool++; }

// Simulates what the extension does when an agent starts up
async function startAgent(
  name: string,
  skills: string[],
  tags: string[],
  serverUrl: string,
  dbPath: string,
): Promise<{
  client: SharedStateClient;
  card: AgentCard;
  events: Array<{ event: string; data: unknown }>;
  unsub: () => void;
}> {
  const card = makeCard(name, skills, tags);
  const client = new SharedStateClient(serverUrl, undefined, name);

  // Register
  await client.register(card);

  // Subscribe to SSE events (like the extension does)
  const events: Array<{ event: string; data: unknown }> = [];
  const unsub = client.subscribe((event, data) => {
    events.push({ event, data });
  });

  // Wait for SSE to connect
  await new Promise(r => setTimeout(r, 150));

  return { client, card, events, unsub };
}

// ── Real Scenarios ──────────────────────────────────────────────

describe("Real Multi-Agent Crash Recovery", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true }); } catch {}
    }
  });

  it("full workflow: delegate → crash → restart → reconnect → resolve", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-real-"));
    tmpDirs.push(tmp);
    const dbPath = path.join(tmp, "state.db");

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Normal operation — 3 agents online
    // ═══════════════════════════════════════════════════════════
    const port1 = nextPort();

    // Planner starts HOST server
    const server1 = new SharedStateServer({ dbPath });
    const url1 = await server1.start(port1);
    console.log(`\n[TEST] Phase 1: Server started at ${url1}`);

    // Backend agent connects
    const backend1 = await startAgent("backend", ["nodejs", "express"], ["code-generation"], url1, dbPath);
    console.log(`[TEST] Backend online: ${backend1.events.length} events`);

    // Frontend agent connects
    const frontend1 = await startAgent("frontend", ["react", "tailwind"], ["frontend-implementation"], url1, dbPath);
    console.log(`[TEST] Frontend online: ${frontend1.events.length} events`);

    // Planner client
    const plannerClient1 = new SharedStateClient(url1, undefined, "planner");

    // Verify all 3 agents registered
    const agents1 = await plannerClient1.listAgents();
    expect(agents1).toHaveLength(2); // backend + frontend (planner didn't register)
    console.log(`[TEST] Agents: ${agents1.map(a => a.name).join(", ")}`);

    // ═══════════════════════════════════════════════════════════
    // Planner delegates task to backend
    // ═══════════════════════════════════════════════════════════
    const sendResult = await plannerClient1.rpcCall("tasks/sendMessage", {
      task: "Build the REST API with Express.js. Create routes for /users, /orders, /products.",
      to: "backend",
      skill: "nodejs",
    });
    const taskId = sendResult.taskId;
    console.log(`[TEST] Task created: ${taskId.slice(0, 8)}...`);

    // Verify backend received the task:created event via SSE
    await new Promise(r => setTimeout(r, 100));
    const taskCreated = backend1.events.find(e => e.event === "task:created");
    expect(taskCreated).toBeDefined();
    expect((taskCreated!.data as any).to).toBe("backend");
    console.log(`[TEST] Backend received task:created via SSE ✅`);

    // Backend also gets a task delegated to frontend (for later)
    await plannerClient1.rpcCall("tasks/sendMessage", {
      task: "Create the dashboard layout",
      to: "frontend",
      skill: "react",
    });

    // Health check
    const health1 = await (await fetch(`${url1}/health`)).json();
    expect(health1.agents).toBe(2);
    expect(health1.tasks).toBe(2);
    console.log(`[TEST] Health: ${health1.agents} agents, ${health1.tasks} tasks`);

    // ═══════════════════════════════════════════════════════════
    // CRASH — server killed abruptly
    // ═══════════════════════════════════════════════════════════
    console.log(`\n[TEST] 💥 CRASH! Killing server...`);
    backend1.unsub();
    frontend1.unsub();
    await server1.stop();

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Server restarts
    // ═══════════════════════════════════════════════════════════
    const port2 = nextPort();
    const server2 = new SharedStateServer({ dbPath });
    const url2 = await server2.start(port2);
    console.log(`\n[TEST] Phase 2: Server restarted at ${url2}`);

    // Verify agents survived in DB (but SSE connections are dead)
    const health2 = await (await fetch(`${url2}/health`)).json();
    expect(health2.agents).toBe(2); // Still in DB!
    expect(health2.tasks).toBe(2);  // Tasks survived!
    console.log(`[TEST] Health after restart: ${health2.agents} agents, ${health2.tasks} tasks ✅`);

    // Verify tasks survived with full data
    const verifyClient = new SharedStateClient(url2);
    const listResult = await verifyClient.rpcCall("tasks/listTasks", {});
    expect(listResult.tasks).toHaveLength(2);
    const backendTask = listResult.tasks.find((t: any) => t.toAgent === "backend");
    expect(backendTask.taskDescription).toBe("Build the REST API with Express.js. Create routes for /users, /orders, /products.");
    expect(backendTask.skillHint).toBe("nodejs");
    console.log(`[TEST] Task data survived: "${backendTask.taskDescription.slice(0, 50)}..." ✅`);

    // ═══════════════════════════════════════════════════════════
    // Agents reconnect (simulating real extension onReconnect)
    // ═══════════════════════════════════════════════════════════
    console.log(`\n[TEST] Agents reconnecting...`);

    // Backend reconnects
    const backendClient2 = new SharedStateClient(url2, undefined, "backend");
    const backendEvents2: Array<{ event: string; data: unknown }> = [];

    // Unregister stale entry then re-register (what extension does)
    await backendClient2.unregister("backend");
    await backendClient2.register(makeCard("backend", ["nodejs", "express"], ["code-generation"]));

    const backendUnsub2 = backendClient2.subscribe((event, data) => {
      backendEvents2.push({ event, data });
    });
    await new Promise(r => setTimeout(r, 150));
    console.log(`[TEST] Backend re-registered ✅`);

    // Frontend reconnects
    const frontendClient2 = new SharedStateClient(url2, undefined, "frontend");
    await frontendClient2.unregister("frontend");
    await frontendClient2.register(makeCard("frontend", ["react", "tailwind"], ["frontend-implementation"]));
    await new Promise(r => setTimeout(r, 100));
    console.log(`[TEST] Frontend re-registered ✅`);

    // Verify agents back online
    const agents2 = await backendClient2.listAgents();
    expect(agents2).toHaveLength(2);
    console.log(`[TEST] Both agents back online: ${agents2.map(a => a.name).join(", ")} ✅`);

    // ═══════════════════════════════════════════════════════════
    // Backend resolves the task that survived the crash
    // ═══════════════════════════════════════════════════════════
    console.log(`\n[TEST] Backend resolving task from before crash...`);

    const resolveResult = await backendClient2.rpcCall("tasks/resolveTask", {
      taskId,
      state: "TASK_STATE_COMPLETED",
      result: "API built! Routes: GET /users, POST /users, GET /orders, POST /orders, GET /products. Full CRUD with validation.",
    });
    expect(resolveResult.task.status.state).toBe("TASK_STATE_COMPLETED");
    console.log(`[TEST] Task resolved ✅`);

    // Verify backend got the task:completed SSE event
    await new Promise(r => setTimeout(r, 100));
    const completedEvent = backendEvents2.find(e => e.event === "task:completed");
    expect(completedEvent).toBeDefined();
    console.log(`[TEST] Backend received task:completed via SSE ✅`);

    // ═══════════════════════════════════════════════════════════
    // Final state check
    // ═══════════════════════════════════════════════════════════
    const finalTask = await backendClient2.rpcCall("tasks/getTask", { taskId });
    expect(finalTask.task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(finalTask.task.artifacts![0].parts[0].text).toContain("Routes: GET /users");
    console.log(`[TEST] Final state verified — artifact preserved ✅`);

    const health3 = await (await fetch(`${url2}/health`)).json();
    expect(health3.agents).toBe(2);
    expect(health3.tasks).toBe(2);
    console.log(`\n[TEST] ═════════════════════════════════`);
    console.log(`[TEST] FULL CRASH RECOVERY VERIFIED ✅`);
    console.log(`[TEST] ═════════════════════════════════`);
    console.log(`[TEST]   2 agents survived crash`);
    console.log(`[TEST]   2 tasks survived crash`);
    console.log(`[TEST]   Agents re-registered after restart`);
    console.log(`[TEST]   Task resolved post-crash`);
    console.log(`[TEST]   SSE events delivered after reconnect`);
    console.log(`[TEST] ═════════════════════════════════\n`);

    // Cleanup
    backendUnsub2();
    await server2.stop();
  });

  it("task delegation flow works after crash — new tasks after restart", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-real-"));
    tmpDirs.push(tmp);
    const dbPath = path.join(tmp, "state.db");

    // Phase 1: Start + register + crash
    const port1 = nextPort();
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(port1);
    const c1 = new SharedStateClient(url1, undefined, "planner");
    await c1.register(makeCard("backend", ["nodejs"], ["code-generation"]));
    await s1.stop();

    // Phase 2: Restart
    const port2 = nextPort();
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(port2);

    // Backend reconnects
    const c2 = new SharedStateClient(url2, undefined, "backend");
    await c2.unregister("backend");
    await c2.register(makeCard("backend", ["nodejs"], ["code-generation"]));

    // Planner delegates NEW task after crash recovery
    const r = await c2.rpcCall("tasks/sendMessage", {
      task: "Add authentication middleware",
      to: "backend",
      skill: "nodejs",
    });
    expect(r.taskId).toBeDefined();

    // Backend resolves
    const resolved = await c2.rpcCall("tasks/resolveTask", {
      taskId: r.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "JWT auth middleware added to all protected routes",
    });
    expect(resolved.task.status.state).toBe("TASK_STATE_COMPLETED");

    console.log(`[TEST] New task delegation after crash → resolved ✅`);
    await s2.stop();
  });
});
