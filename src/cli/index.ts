/**
 * PiPal-A2A CLI — Standalone Entry Point
 * 
 * karpathy-clean-code: Presentation layer.
 * Alternative to the pi extension — runs as standalone CLI.
 * Uses the same bootstrapNetwork() factory as the extension.
 * 
 * Usage:
 *   npx pipal-a2a start [agent]    Start all agents
 *   npx pipal-a2a status           Show agent registry
 *   npx pipal-a2a send <f> <t> <task>  Send task directly
 */

import { readFileSync } from "fs";
import { load } from "js-yaml";
import { resolve } from "path";
import { 
  createAgentCard, 
  createMessage,
  type Skill,
} from "../core/types.js";
import { A2AClient } from "../infrastructure/transport.js";
import { bootstrapNetwork } from "../application/network.js";

// ─────────────────────────────────────────────────────────────────
// Config loading (shared with network.ts, but CLI needs it for status/send)
// ─────────────────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  description?: string;
  endpoint: string;
  skills: Array<{ id: string; name: string; description: string }>;
}

interface CliConfig {
  agents: AgentConfig[];
  port?: number;
}

function loadConfig(): CliConfig {
  const configPath = resolve(process.cwd(), "config/agents.yaml");
  try {
    const content = readFileSync(configPath, "utf8");
    return load(content) as CliConfig;
  } catch {
    return { agents: [], port: 4001 };
  }
}

// ─────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────

async function cmdStart(agentName?: string): Promise<void> {
  // If filtering to specific agent, we still use bootstrapNetwork
  // but it reads all config. Filtering happens at the network level.
  // For now, start all agents.
  const network = await bootstrapNetwork();
  
  const agents = network.listAgents();
  console.log(`[CLI] ${agents.length} agent(s) running. Press Ctrl+C to stop.`);
  console.log(`[CLI] Agents: ${agents.map(a => a.name).join(", ")}`);
  
  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[CLI] Shutting down...");
    await network.shutdown();
    process.exit(0);
  });
}

async function cmdStatus(): Promise<void> {
  const config = loadConfig();
  
  console.log("\n📋 Agent Registry\n");
  console.log("Name          Skills                    Endpoint");
  console.log("─".repeat(60));
  
  for (const agent of config.agents) {
    const skills = agent.skills.map(s => s.id).join(", ");
    console.log(`${agent.name.padEnd(14)} ${skills.padEnd(24)} ${agent.endpoint}`);
  }
  
  console.log();
}

async function cmdSend(from: string, to: string, task: string): Promise<void> {
  const config = loadConfig();
  
  const sender = config.agents.find(a => a.name === from);
  if (!sender) {
    console.error(`[CLI] Unknown agent: ${from}`);
    process.exit(1);
  }
  
  const receiver = config.agents.find(a => a.name === to);
  if (!receiver) {
    console.error(`[CLI] Unknown agent: ${to}`);
    process.exit(1);
  }
  
  const message = createMessage(from, to, "execute", { task });
  const client = new A2AClient(receiver.endpoint);
  await client.send(message);
  
  console.log(`[CLI] Sent task to ${to}: ${task}`);
}

// ─────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "start":
    await cmdStart(args[0]);
    break;
    
  case "status":
    await cmdStatus();
    break;
    
  case "send":
    if (args.length < 3) {
      console.error("Usage: pipal-a2a send <from> <to> <task>");
      process.exit(1);
    }
    await cmdSend(args[0], args[1], args.slice(2).join(" "));
    break;
    
  default:
    console.log(`
PiPal-A2A — Peer-to-peer multi-agent orchestration

Commands:
  pipal-a2a start [agent]              Start all agents
  pipal-a2a status                     Show agent registry
  pipal-a2a send <from> <to> <task>    Send task directly

As pi extension:
  pi install ./pipal-a2a               Install as pi extension
  /pipal-status                        Show agent network status

The LLM automatically gets the pipal_a2a_delegate tool.
`);
    process.exit(command ? 1 : 0);
}
