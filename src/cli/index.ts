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

import { SharedStateServer, SharedStateClient } from "../infrastructure/shared-state.js";

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
  const client = new SharedStateClient(sharedStateUrl);
  try {
    const agents = await client.listAgents();
    if (agents.length === 0) {
      console.log("No agents online.");
      return;
    }
    console.log(`\n📋 ${agents.length} agent(s) online:\n`);
    for (const a of agents) {
      const skills = a.skills.map((s) => s.id).join(", ") || "none";
      console.log(`  ${a.name}: [${skills}]`);
    }
    console.log();
  } catch {
    console.error(`Failed to connect to shared state at ${sharedStateUrl}`);
    process.exit(1);
  }
}

async function cmdHealth(): Promise<void> {
  const client = new SharedStateClient(sharedStateUrl);
  try {
    const reachable = await client.isReachable();
    if (reachable) {
      const agents = await client.listAgents();
      console.log(`✅ Shared state running at ${sharedStateUrl}`);
      console.log(`   ${agents.length} agent(s) connected`);
    } else {
      console.log(`❌ Shared state not reachable at ${sharedStateUrl}`);
      process.exit(1);
    }
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
