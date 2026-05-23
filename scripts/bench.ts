import { SharedStateServer, SharedStateClient } from '../src/infrastructure/shared-state.js';
import { createAgentCard, createSkill } from '../src/core/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipal-perf-'));
const dbPath = path.join(tmp, 'state.db');

async function bench() {
  const server = new SharedStateServer({ dbPath });
  const url = await server.start(48001);
  const client = new SharedStateClient(url);

  // ── 1. Register agents ──
  console.log('\n═══ REGISTER AGENTS ═══');
  const agentCount = 50;
  const start1 = Date.now();
  for (let i = 0; i < agentCount; i++) {
    await client.register(createAgentCard(
      `agent-${i}`, url,
      [`skill-${i}`].map(s => createSkill(s, s, s)),
      { description: `Agent ${i}` }
    ));
  }
  console.log(`${agentCount} agents: ${Date.now() - start1}ms`);

  // ── 2. Create tasks ──
  console.log('\n═══ CREATE TASKS ═══');
  const taskCount = 100;
  const start2 = Date.now();
  const taskIds: string[] = [];
  for (let i = 0; i < taskCount; i++) {
    const r = await client.rpcCall('tasks/sendMessage', {
      task: `Task ${i}: do the thing`,
      to: `agent-${i % agentCount}`,
    });
    taskIds.push(r.taskId);
  }
  console.log(`${taskCount} tasks: ${Date.now() - start2}ms`);

  // ── 3. Resolve tasks ──
  console.log('\n═══ RESOLVE TASKS ═══');
  const start3 = Date.now();
  for (let i = 0; i < taskCount; i++) {
    await client.rpcCall('tasks/resolveTask', {
      taskId: taskIds[i],
      state: 'TASK_STATE_COMPLETED',
      result: `Result ${i}`,
    });
  }
  console.log(`${taskCount} resolves: ${Date.now() - start3}ms`);

  // ── 4. listAgents (called by broadcast, health) ──
  console.log('\n═══ LIST AGENTS (bottleneck test) ═══');
  const start4 = Date.now();
  for (let i = 0; i < 1000; i++) {
    await client.listAgents();
  }
  console.log(`1000 listAgents: ${Date.now() - start4}ms (${((Date.now() - start4)/1000).toFixed(1)}ms each)`);

  // ── 5. listTasks ──
  console.log('\n═══ LIST TASKS (bottleneck test) ═══');
  const start5 = Date.now();
  for (let i = 0; i < 100; i++) {
    await client.rpcCall('tasks/listTasks', {});
  }
  console.log(`100 listTasks: ${Date.now() - start5}ms (${((Date.now() - start5)/100).toFixed(1)}ms each)`);

  // ── 6. getTask (single) ──
  console.log('\n═══ GET TASK (single lookup) ═══');
  const start6 = Date.now();
  for (let i = 0; i < 1000; i++) {
    await client.rpcCall('tasks/getTask', { taskId: taskIds[0] });
  }
  console.log(`1000 getTask: ${Date.now() - start6}ms (${((Date.now() - start6)/1000).toFixed(1)}ms each)`);

  // ── 7. Health endpoint ──
  console.log('\n═══ HEALTH (now uses COUNT + names only) ═══');
  const start7 = Date.now();
  for (let i = 0; i < 1000; i++) {
    await fetch(url + '/health');
  }
  const healthJson = await (await fetch(url + '/health')).json();
  console.log(`1000 health: ${Date.now() - start7}ms (${((Date.now() - start7)/1000).toFixed(1)}ms each)`);
  console.log(`health data: ${healthJson.agents} agents, ${healthJson.tasks} tasks`);

  await server.stop();
  fs.rmSync(tmp, { recursive: true });
}
bench().catch(e => console.error(e));
