/**
 * PiPal-A2A CLI — Standalone Shared State Server
 * 
 * Starts only the shared state rendezvous server.
 * Useful for running the server separately from any pi terminal.
 * 
 * Usage:
 *   npx pipal-a2a serve          Start shared state server
 *   npx pipal-a2a agents         List agents in shared state
 *   npx pipal-a2a health         Check shared state health
 * 
 * Normal usage doesn't need this CLI — the pi extension auto-starts
 * the shared state server when it's the first terminal (HOST mode).
 */

import { SharedStateServer } from "../infrastructure/shared-state.js";

const [command, ...args] = process.argv.slice(2);
const port = parseInt(args[0]) || 5000;
const sharedStateUrl = `http://localhost:${port}`;

async function cmdServe(): Promise<void> {
  const server = new SharedStateServer();
  await server.start(port);
  console.log(`\n🚀 PiPal-A2A Shared State Server`);
  console.log(`   URL: ${sharedStateUrl}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /health      Health check`);
  console.log(`     GET  /agents      List online agents`);
  console.log(`     GET  /events      SSE stream`);
  console.log(`     POST /register    Register agent`);
  console.log(`     POST /tasks       Create task`);
  console.log(`\n   Press Ctrl+C to stop\n`);

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  });
}

async function cmdAgents(): Promise<void> {
  try {
    const healthRes = await fetch(`${sharedStateUrl}/health`);
    if (!healthRes.ok) {
      console.log(`❌ Shared state not reachable at ${sharedStateUrl}`);
      process.exit(1);
    }
    const h = await healthRes.json() as {
      agents: number;
      agentNames: string[];
      sse: { connectedAgents: string[] };
    };

    if (h.agents === 0) {
      console.log("No agents registered.");
      return;
    }

    console.log(`\n📋 ${h.agents} agent(s):\n`);
    for (const name of h.agentNames) {
      const connected = h.sse.connectedAgents.includes(name);
      const status = connected ? "🟢 online" : "🔴 offline (no SSE)";
      console.log(`  ${name} — ${status}`);
    }
    console.log();
  } catch {
    console.error(`Failed to connect to shared state at ${sharedStateUrl}`);
    process.exit(1);
  }
}

async function cmdHealth(): Promise<void> {
  try {
    const res = await fetch(`${sharedStateUrl}/health`);
    if (!res.ok) {
      console.log(`❌ Shared state not reachable at ${sharedStateUrl} (HTTP ${res.status})`);
      process.exit(1);
    }
    const h = await res.json() as {
      ok: boolean;
      agents: number;
      agentNames: string[];
      tasks: number;
      taskBreakdown: Record<string, number>;
      sse: { clients: number; taskStreams: number; connectedAgents: string[] };
      db: boolean;
    };

    console.log(`\n✅ PiPal-A2A Shared State — ${sharedStateUrl}\n`);
    console.log(`  DB:     ${h.db ? "🟢 ok" : "🔴 unreachable"}`);
    console.log(`  Agents: ${h.agents} registered, ${h.sse.connectedAgents.length} connected`);
    if (h.agentNames.length > 0) {
      for (const name of h.agentNames) {
        const connected = h.sse.connectedAgents.includes(name);
        console.log(`    ${connected ? "🟢" : "🔴"} ${name}`);
      }
    }
    console.log(`  Tasks:  ${h.tasks}`);
    if (Object.keys(h.taskBreakdown).length > 0) {
      for (const [state, count] of Object.entries(h.taskBreakdown)) {
        const label = state.replace("TASK_STATE_", "");
        console.log(`    ${label}: ${count}`);
      }
    }
    console.log(`  SSE:    ${h.sse.clients} clients, ${h.sse.taskStreams} task streams`);
    console.log();
  } catch {
    console.log(`❌ Shared state not reachable at ${sharedStateUrl}`);
    process.exit(1);
  }
}

switch (command) {
  case "serve":
    await cmdServe();
    break;

  case "agents":
    await cmdAgents();
    break;

  case "health":
    await cmdHealth();
    break;

  default:
    console.log(`
PiPal-A2A — P2P Agent Network CLI

Commands:
  pipal-a2a serve [port]    Start shared state server (default: 5000)
  pipal-a2a agents [port]   List online agents
  pipal-a2a health [port]   Check if shared state is running

Normal usage:
  The pi extension auto-manages the shared state.
  First terminal → HOST mode (starts server)
  Other terminals → JOIN mode (connects)

  This CLI is only needed for standalone server operation.

Config:
  config/pipal-a2a.yaml     Per-terminal identity and shared state URL
`);
    process.exit(command ? 1 : 0);
}
