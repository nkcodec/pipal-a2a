/**
 * PiPal-A2A CLI
 * 
 * karpathy-clean-code: Presentation layer.
 * Wires config → registry → pipeline.
 * No business logic here — all behavior lives in application layer.
 */

import { readFileSync } from "fs";
import { load } from "js-yaml";
import { resolve } from "path";
import { 
  createAgentCard, 
  createMessage,
  type AgentCard,
  type Skill
} from "../core/types.js";
import { A2ATransport, A2AClient, LocalMessageBus } from "../infrastructure/transport.js";
import { InMemoryAgentRegistry, DefaultTaskRouter, Agent } from "../application/index.js";

// ─────────────────────────────────────────────────────────────────
// Config loading
// ─────────────────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  description?: string;
  endpoint: string;
  skills: Array<{ id: string; name: string; description: string }>;
}

interface Config {
  agents: AgentConfig[];
  port?: number;
}

function loadConfig(): Config {
  const configPath = resolve(process.cwd(), "config/agents.yaml");
  try {
    const content = readFileSync(configPath, "utf8");
    return load(content) as Config;
  } catch {
    // Default config if file not found
    return {
      agents: [],
      port: 4001,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────

async function cmdStart(agentName?: string): Promise<void> {
  const config = loadConfig();
  const port = config.port || 4001;
  
  // Create shared components
  const registry = new InMemoryAgentRegistry();
  const router = new DefaultTaskRouter(registry);
  const messageBus = new LocalMessageBus();
  
  // Start HTTP server for SSE (dashboard events)
  const app = (await import("express")).default();
  const server = app.listen(port + 1000);
  
  // Wire SSE for message bus events
  app.get("/events", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);
    
    const unsubscribe = messageBus.subscribe("*", (data) => {
      res.write(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
    });
    
    _req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    
    res.write("event: connected\ndata: {}\n\n");
  });
  
  // Register agents from config
  const agents: Agent[] = [];
  
  for (const cfg of config.agents) {
    if (agentName && cfg.name !== agentName) continue;
    
    const skills: Skill[] = cfg.skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));
    
    const card = createAgentCard(cfg.name, `http://localhost:${port}`, skills, {
      description: cfg.description || "",
    });
    
    registry.register(card);
    
    const transport = new A2ATransport(card);
    await transport.listen(port);
    
    const agent = new Agent(card, transport, router, messageBus);
    await agent.start();
    agents.push(agent);
    
    console.log(`[CLI] Started agent: ${cfg.name}`);
  }
  
  console.log(`[CLI] Dashboard: http://localhost:${port + 1000}/events`);
  console.log(`[CLI] ${agents.length} agent(s) running. Press Ctrl+C to stop.`);
  
  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[CLI] Shutting down...");
    for (const agent of agents) {
      await agent.dispose();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
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
  
  // Find sender agent card
  const sender = config.agents.find(a => a.name === from);
  if (!sender) {
    console.error(`[CLI] Unknown agent: ${from}`);
    process.exit(1);
  }
  
  // Find receiver agent card
  const receiver = config.agents.find(a => a.name === to);
  if (!receiver) {
    console.error(`[CLI] Unknown agent: ${to}`);
    process.exit(1);
  }
  
  // Create message
  const message = createMessage(from, to, "execute", { task });
  
  // Send via A2A client
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
  pipal-a2a start [agent]     Start all agents (or specific agent)
  pipal-a2a status            Show agent registry
  pipal-a2a send <from> <to> <task>  Send task directly
  
Example:
  pipal-a2a start              # Start all agents
  pipal-a2a status            # Show available agents
  pipal-a2a send orchestrator backend-worker "Write hello world"
`);
    process.exit(command ? 1 : 0);
}