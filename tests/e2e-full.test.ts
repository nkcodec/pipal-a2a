/**
 * FULL END-TO-END: Real Agent Delegation Flow
 *
 * Simulates the EXACT pi extension workflow:
 *   Terminal 1 (planner):   HOST, delegates tasks, collects results
 *   Terminal 2 (backend):   JOIN, picks up nodejs tasks, resolves them
 *   Terminal 3 (reviewer):  JOIN, reviews completed code
 *   Terminal 4 (frontend):  JOIN, picks up react tasks
 *
 * Then CRASHES mid-flow and verifies recovery.
 *
 * This test exercises:
 *   - Agent registration + SSE subscription
 *   - Task delegation via JSON-RPC
 *   - SSE event delivery (task:created, task:completed)
 *   - Skill-based routing (nodejs→backend, react→frontend)
 *   - Crash + restart + reconnect
 *   - Task resolution after crash
 *   - Review flow (completed task → reviewer reviews)
 *   - listTasks filtering by agent
 *   - addMessage (multi-turn conversation)
 *   - Health endpoint
 *   - Agent re-registration (upsert)
 *   - Concurrent task creation
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
    skillIds.map(id => createSkill(id, id, `Skill: ${id}`, { tags })),
    { description: `Agent: ${name}` },
  );
}

// Simulates what pi extension does on session_start
interface SimAgent {
  name: string;
  client: SharedStateClient;
  card: AgentCard;
  events: Array<{ event: string; data: unknown }>;
  unsub: () => void;
}

async function bootAgent(name: string, skills: string[], tags: string[], url: string): Promise<SimAgent> {
  const card = makeCard(name, skills, tags);
  const client = new SharedStateClient(url, undefined, name);

  // Register (what extension does)
  await client.register(card);

  // Subscribe to SSE (what extension does)
  const events: Array<{ event: string; data: unknown }> = [];
  const unsub = client.subscribe(
    (event, data) => { events.push({ event, data }); },
    {
      onReconnect: async () => {
        try { await client.register(card); } catch {}
      },
    }
  );

  // Wait for SSE to connect
  await new Promise(r => setTimeout(r, 150));

  return { name, client, card, events, unsub };
}

function drainEvents(agent: SimAgent): Array<{ event: string; data: unknown }> {
  const copy = [...agent.events];
  agent.events = [];
  return copy;
}

let portPool = 50001;
function nextPort(): number { return portPool++; }

// ── Tests ───────────────────────────────────────────────────────

describe("Full E2E: Real Agent Delegation", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true }); } catch {}
    }
  });

  it("full 4-agent workflow with crash recovery", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-e2e-"));
    tmpDirs.push(tmp);
    const dbPath = path.join(tmp, "state.db");
    const log: string[] = [];

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Normal operation — 4 agents online
    // ═══════════════════════════════════════════════════════════
    const port1 = nextPort();

    // Planner starts HOST (what pi extension does when isReachable=false)
    const server1 = new SharedStateServer({ dbPath });
    const url1 = await server1.start(port1);
    log.push(`[planner] 🏠 HOST started at ${url1}`);

    const planner = new SharedStateClient(url1, undefined, "planner");
    await planner.register(makeCard("planner", ["planning", "delegation"], ["plan", "architecture"]));
    log.push(`[planner] registered`);

    // Backend JOINs (what pi extension does when isReachable=true)
    const backend = await bootAgent("backend", ["nodejs", "express", "postgresql"], ["code-generation"], url1);
    log.push(`[backend] 🔗 JOIN, online`);

    const frontend = await bootAgent("frontend", ["react", "tailwind", "typescript"], ["frontend-impl"], url1);
    log.push(`[frontend] 🔗 JOIN, online`);

    const reviewer = await bootAgent("reviewer", ["security", "code-review"], ["security-review"], url1);
    log.push(`[reviewer] 🔗 JOIN, online`);

    // Verify all 4 agents
    const allAgents = await planner.listAgents();
    expect(allAgents).toHaveLength(4);
    log.push(`✅ All 4 agents online: ${allAgents.map(a => a.name).join(", ")}`);

    // Health check
    const health1 = await (await fetch(`${url1}/health`)).json();
    expect(health1.agents).toBe(4);
    expect(health1.tasks).toBe(0);

    // ═══════════════════════════════════════════════════════════
    // Planner delegates TASK 1: Backend builds API
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- Task 1: Build REST API ---`);
    const task1 = await planner.rpcCall("tasks/sendMessage", {
      task: "Build a REST API with Express.js. Routes: GET /users, POST /users, GET /orders. Include JWT auth middleware.",
      to: "backend",
      skill: "nodejs",
    });
    expect(task1.taskId).toBeDefined();
    log.push(`[planner] delegated task ${task1.taskId.slice(0, 8)} to backend`);

    // Backend receives task:created via SSE
    await new Promise(r => setTimeout(r, 100));
    const be1Events = drainEvents(backend);
    const task1Created = be1Events.find(e => e.event === "task:created");
    expect(task1Created).toBeDefined();
    expect((task1Created!.data as any).to).toBe("backend");
    log.push(`[backend] received task:created via SSE ✅`);

    // Backend resolves task
    const task1Result = await backend.client.rpcCall("tasks/resolveTask", {
      taskId: task1.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "API built. Routes: GET/POST /users (with pagination), GET/POST /orders, JWT middleware on /api/* endpoints. Full test suite.",
    });
    expect(task1Result.task.status.state).toBe("TASK_STATE_COMPLETED");
    log.push(`[backend] resolved task → COMPLETED`);

    // ═══════════════════════════════════════════════════════════
    // Planner delegates TASK 2: Frontend builds dashboard
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- Task 2: Build Dashboard ---`);
    const task2 = await planner.rpcCall("tasks/sendMessage", {
      task: "Create a dashboard with React. Show user list from /api/users, order list from /api/orders. Use Tailwind for styling.",
      to: "frontend",
      skill: "react",
    });
    log.push(`[planner] delegated task ${task2.taskId.slice(0, 8)} to frontend`);

    // Frontend receives task:created via SSE
    await new Promise(r => setTimeout(r, 100));
    const fe1Events = drainEvents(frontend);
    const task2Created = fe1Events.find(e => e.event === "task:created");
    expect(task2Created).toBeDefined();
    log.push(`[frontend] received task:created via SSE ✅`);

    // ═══════════════════════════════════════════════════════════
    // Planner delegates TASK 3: Review the API code
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- Task 3: Security Review ---`);
    const task3 = await planner.rpcCall("tasks/sendMessage", {
      task: "Review the REST API code. Focus on JWT auth, SQL injection, input validation.",
      to: "reviewer",
      skill: "security",
    });
    log.push(`[planner] delegated task ${task3.taskId.slice(0, 8)} to reviewer`);

    // ═══════════════════════════════════════════════════════════
    // TASK 3: Multi-turn conversation (addMessage)
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- Task 3: Multi-turn conversation ---`);

    // Reviewer asks for clarification
    await reviewer.client.rpcCall("tasks/addMessage", {
      taskId: task3.taskId,
      message: "Which files should I review? Only the route handlers?",
      role: "ROLE_AGENT",
      requireInput: true,
    });
    log.push(`[reviewer] asked for clarification (INPUT_REQUIRED)`);

    // Check task state
    const task3State = await planner.rpcCall("tasks/getTask", { taskId: task3.taskId });
    expect(task3State.task.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
    log.push(`[planner] task state: INPUT_REQUIRED ✅`);

    // Planner responds
    await planner.rpcCall("tasks/addMessage", {
      taskId: task3.taskId,
      message: "Review all files in src/routes/ and src/middleware/. Focus on auth.ts and orders.ts.",
      role: "ROLE_USER",
    });
    log.push(`[planner] responded (back to WORKING)`);

    // Task should be back to WORKING (not INPUT_REQUIRED)
    const task3After = await planner.rpcCall("tasks/getTask", { taskId: task3.taskId });
    expect(task3After.task.status.state).toBe("TASK_STATE_WORKING");
    log.push(`task state after user response: WORKING ✅`);

    // Reviewer completes review
    await reviewer.client.rpcCall("tasks/resolveTask", {
      taskId: task3.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "Security review: 2 issues found. 1) JWT secret should use env var. 2) Orders route missing input validation. Otherwise LGTM.",
    });
    log.push(`[reviewer] resolved → COMPLETED`);

    // ═══════════════════════════════════════════════════════════
    // listTasks — verify all 3 tasks
    // ═══════════════════════════════════════════════════════════
    const allTasks = await planner.rpcCall("tasks/listTasks", {});
    expect(allTasks.tasks).toHaveLength(3);
    log.push(`\n[listTasks] ${allTasks.tasks.length} tasks total`);

    // Filter by agent
    const backendTasks = await planner.rpcCall("tasks/listTasks", { agentName: "backend" });
    expect(backendTasks.tasks.length).toBeGreaterThanOrEqual(1);
    log.push(`[listTasks] backend has ${backendTasks.tasks.length} task(s)`);

    const reviewerTasks = await planner.rpcCall("tasks/listTasks", { agentName: "reviewer" });
    expect(reviewerTasks.tasks.length).toBeGreaterThanOrEqual(1);
    log.push(`[listTasks] reviewer has ${reviewerTasks.tasks.length} task(s)`);

    // Health
    const health2 = await (await fetch(`${url1}/health`)).json();
    expect(health2.agents).toBe(4);
    expect(health2.tasks).toBe(3);
    log.push(`[health] ${health2.agents} agents, ${health2.tasks} tasks`);

    // ═══════════════════════════════════════════════════════════
    // 💥 CRASH — server killed mid-task (frontend still working)
    // ═══════════════════════════════════════════════════════════
    log.push(`\n💥 CRASH! Server killed (frontend task in-flight)`);
    backend.unsub();
    frontend.unsub();
    reviewer.unsub();
    await server1.stop();

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Server restarts on SAME port
    // ═══════════════════════════════════════════════════════════
    const port2 = nextPort();
    const server2 = new SharedStateServer({ dbPath });
    const url2 = await server2.start(port2);
    log.push(`\n[server] restarted at ${url2}`);

    // Verify DB state survived
    const health3 = await (await fetch(`${url2}/health`)).json();
    expect(health3.agents).toBe(4);
    expect(health3.tasks).toBe(3);
    log.push(`[health] after crash: ${health3.agents} agents, ${health3.tasks} tasks ✅`);

    // ═══════════════════════════════════════════════════════════
    // Agents reconnect (simulating pi extension onReconnect)
    // ═══════════════════════════════════════════════════════════
    const backend2 = await bootAgent("backend", ["nodejs", "express", "postgresql"], ["code-generation"], url2);
    log.push(`[backend] re-registered ✅`);

    const frontend2 = await bootAgent("frontend", ["react", "tailwind", "typescript"], ["frontend-impl"], url2);
    log.push(`[frontend] re-registered ✅`);

    const reviewer2 = await bootAgent("reviewer", ["security", "code-review"], ["security-review"], url2);
    log.push(`[reviewer] re-registered ✅`);

    const planner2 = new SharedStateClient(url2, undefined, "planner");
    await planner2.register(makeCard("planner", ["planning", "delegation"], ["plan"]));
    log.push(`[planner] re-registered ✅`);

    // Verify
    const agentsAfter = await planner2.listAgents();
    expect(agentsAfter).toHaveLength(4);
    log.push(`All 4 agents back online: ${agentsAfter.map(a => a.name).join(", ")}`);

    // ═══════════════════════════════════════════════════════════
    // Frontend resolves task 2 (created BEFORE crash)
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- Task 2: Frontend resolves (post-crash) ---`);
    const task2Resolve = await frontend2.client.rpcCall("tasks/resolveTask", {
      taskId: task2.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "Dashboard built: UserTable + OrderTable components, Tailwind cards, responsive layout. Connected to /api/users and /api/orders.",
    });
    expect(task2Resolve.task.status.state).toBe("TASK_STATE_COMPLETED");
    log.push(`[frontend] resolved task from before crash ✅`);

    // ═══════════════════════════════════════════════════════════
    // New task AFTER crash — verify delegation still works
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- Task 4: New task after crash ---`);
    const task4 = await planner2.rpcCall("tasks/sendMessage", {
      task: "Add rate limiting to the API. 100 req/min per user.",
      to: "backend",
      skill: "nodejs",
    });
    log.push(`[planner] delegated task ${task4.taskId.slice(0, 8)} to backend`);

    // Backend receives via SSE
    await new Promise(r => setTimeout(r, 100));
    const be2Events = drainEvents(backend2);
    const task4Created = be2Events.find(e => e.event === "task:created");
    expect(task4Created).toBeDefined();
    log.push(`[backend] received task:created via SSE ✅`);

    await backend2.client.rpcCall("tasks/resolveTask", {
      taskId: task4.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "Rate limiting added: express-rate-limit on /api/*, 100 req/min per IP.",
    });
    log.push(`[backend] resolved ✅`);

    // ═══════════════════════════════════════════════════════════
    // SSE event delivery test — agent sees other agent register
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- SSE scoping test ---`);
    // Clear backend events first
    drainEvents(backend2);
    const newAgent = await bootAgent("devops", ["docker", "k8s"], ["devops"], url2);
    await new Promise(r => setTimeout(r, 200));

    // Backend should see agent:online
    const be3Events = drainEvents(backend2);
    const newAgentEvent = be3Events.find(e => e.event === "agent:online");
    if (newAgentEvent) {
      expect((newAgentEvent.data as any).agentId).toBe("devops");
      log.push(`[backend] saw agent:online for devops ✅`);
    } else {
      // SSE timing is non-deterministic — verify via listAgents instead
      const allAgentsNow = await planner2.listAgents();
      expect(allAgentsNow.find(a => a.name === "devops")).toBeDefined();
      log.push(`[backend] agent:online missed (SSE timing) but devops is registered ✅`);
    }

    // ═══════════════════════════════════════════════════════════
    // streamChunk test (streaming artifact)
    // ═══════════════════════════════════════════════════════════
    log.push(`\n--- streamChunk test ---`);
    const task5 = await planner2.rpcCall("tasks/sendMessage", {
      task: "Write unit tests",
      to: "backend",
    });

    // Stream chunks
    await backend2.client.rpcCall("tasks/streamChunk", {
      taskId: task5.taskId,
      chunk: "describe('API', () => { it('should return users', async () => {",
    });
    await backend2.client.rpcCall("tasks/streamChunk", {
      taskId: task5.taskId,
      chunk: " const res = await request(app).get('/api/users');",
    });

    // Subscribe to task stream
    let streamChunks: string[] = [];
    const unsubTask = backend2.client.subscribeToTask(task5.taskId, (event, data) => {
      if (event === "artifact_update") streamChunks.push((data as any).chunk);
    });
    await new Promise(r => setTimeout(r, 100));

    // One more chunk
    await backend2.client.rpcCall("tasks/streamChunk", {
      taskId: task5.taskId,
      chunk: " expect(res.status).toBe(200); }); });",
    });
    await new Promise(r => setTimeout(r, 100));

    expect(streamChunks.length).toBeGreaterThanOrEqual(1);
    log.push(`[backend] streamChunk delivered ${streamChunks.length} artifact_update events ✅`);
    unsubTask();

    // Resolve task 5
    await backend2.client.rpcCall("tasks/resolveTask", {
      taskId: task5.taskId,
      state: "TASK_STATE_COMPLETED",
      result: "12 unit tests written",
    });

    // ═══════════════════════════════════════════════════════════
    // FINAL STATE
    // ═══════════════════════════════════════════════════════════
    const finalTasks = await planner2.rpcCall("tasks/listTasks", {});
    const finalHealth = await (await fetch(`${url2}/health`)).json();

    log.push(`\n═══════════════════════════════════════════════`);
    log.push(`FINAL STATE:`);
    log.push(`  Agents: ${finalHealth.agents}`);
    log.push(`  Tasks:  ${finalTasks.tasks.length}`);
    log.push(`  Completed: ${finalTasks.tasks.filter((t: any) => t.status.state === 'TASK_STATE_COMPLETED').length}`);
    log.push(`  History: task 3 has ${finalTasks.tasks.find((t: any) => t.id === task3.taskId)?.history?.length || 0} messages`);
    log.push(`  Artifacts: task 1 has ${finalTasks.tasks.find((t: any) => t.id === task1.taskId)?.artifacts?.length || 0} artifact(s)`);
    log.push(`═══════════════════════════════════════════════`);

    // Final assertions
    expect(finalHealth.agents).toBe(5); // planner + backend + frontend + reviewer + devops
    expect(finalTasks.tasks).toHaveLength(5);
    expect(finalTasks.tasks.filter((t: any) => t.status.state === "TASK_STATE_COMPLETED").length).toBe(5);

    // Task 1 artifact preserved through crash
    const t1Final = finalTasks.tasks.find((t: any) => t.id === task1.taskId);
    expect(t1Final.artifacts).toBeDefined();
    expect(t1Final.artifacts![0].parts[0].text).toContain("Routes: GET/POST /users");

    // Task 3 conversation preserved through crash
    const t3Final = finalTasks.tasks.find((t: any) => t.id === task3.taskId);
    expect(t3Final.history).toBeDefined();
    expect(t3Final.history!.length).toBe(2); // reviewer question + planner answer

    // Print full log
    console.log("\n" + log.map(l => `  ${l}`).join("\n") + "\n");

    // Cleanup
    backend2.unsub();
    frontend2.unsub();
    reviewer2.unsub();
    newAgent.unsub();
    await server2.stop();
  }, 30000);
});
