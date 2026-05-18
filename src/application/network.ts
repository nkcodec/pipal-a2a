/**
 * PiPal-A2A Application — Network Bootstrap Factory
 * 
 * karpathy-clean-code: Application layer.
 * Factory function that creates and wires an entire P2P agent network.
 * Shared by both the pi extension entry point and the standalone CLI.
 * 
 * No business logic — only coordinates construction and wiring.
 */

import { readFileSync } from "fs";
import { load } from "js-yaml";
import { resolve } from "path";
import { 
  createAgentCard, 
  type Skill,
} from "../core/types.js";
import type { 
  A2AMessage, 
  MessageBus,
} from "../sdk/index.js";
import { InMemoryAgentRegistry } from "./registry.js";
import { DefaultTaskRouter } from "./router.js";
import { Agent } from "./agent.js";
import { A2ATransport, LocalMessageBus } from "../infrastructure/transport.js";
import { PiAgentRuntime } from "../infrastructure/pi-runtime.js";

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  description?: string;
  endpoint: string;
  port?: number;
  model?: string;
  skills: Array<{ id: string; name: string; description: string }>;
}

interface NetworkConfig {
  agents: AgentConfig[];
  basePort?: number;
}

function loadConfig(configPath?: string): NetworkConfig {
  const path = configPath ?? resolve(process.cwd(), "config/agents.yaml");
  try {
    const content = readFileSync(path, "utf8");
    return load(content) as NetworkConfig;
  } catch {
    return {
      agents: [],
      basePort: 4001,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Network handle — returned to caller
// ─────────────────────────────────────────────────────────────────

export interface AgentNetwork {
  /** Delegate a task to the network */
  delegate(params: {
    task: string;
    skill?: string;
    to?: string;
  }): Promise<unknown>;
  
  /** List all online agents */
  listAgents(): Array<{ name: string; skills: string[]; endpoint: string }>;
  
  /** Gracefully shut down all agents */
  shutdown(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────

/**
 * Bootstrap a P2P agent network.
 * 
 * Reads config, creates agents, wires transports and routers.
 * Returns a handle for delegation and lifecycle management.
 */
export async function bootstrapNetwork(configPath?: string): Promise<AgentNetwork> {
  const config = loadConfig(configPath);
  const basePort = config.basePort ?? 4001;
  
  // Shared components
  const registry = new InMemoryAgentRegistry();
  const messageBus: MessageBus = new LocalMessageBus();
  const router = new DefaultTaskRouter(registry);
  const agents: Agent[] = [];
  const transports: A2ATransport[] = [];
  
  // Create agents from config
  for (let i = 0; i < config.agents.length; i++) {
    const cfg = config.agents[i];
    const port = cfg.port ?? basePort + i;
    
    const skills: Skill[] = cfg.skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));
    
    const card = createAgentCard(
      cfg.name, 
      cfg.endpoint || `http://localhost:${port}`, 
      skills,
      { description: cfg.description || "" }
    );
    
    registry.register(card);
    
    // Create transport (infrastructure)
    const transport = new A2ATransport(card);
    await transport.listen(port);
    transports.push(transport);
    
    // Create runtime (infrastructure) — wraps createAgentSession()
    const runtime = new PiAgentRuntime(cfg.name, {
      model: cfg.model,
      systemPrompt: `You are ${cfg.name}. ${cfg.description || "Execute tasks assigned to you."}`,
    });
    await runtime.start();
    
    // Create agent (application) — wires everything together
    const agent = new Agent(card, transport, router, messageBus, runtime);
    await agent.start();
    agents.push(agent);
    
    console.log(`[Network] Started agent: ${cfg.name} on port ${port}`);
  }
  
  console.log(`[Network] ${agents.length} agent(s) online`);
  
  return {
    async delegate(params) {
      const { task, skill, to } = params;
      
      // Create an A2A message
      const message: A2AMessage = {
        id: crypto.randomUUID(),
        from: "user",
        to: to || "*",
        action: "delegate",
        payload: { task },
        skill,
        timestamp: Date.now(),
      };
      
      // Route to best agent
      const target = await router.route(message);
      if (!target) {
        throw new Error(`No agent available for task${skill ? ` (skill: ${skill})` : ""}`);
      }
      
      // Find the agent instance and execute
      const targetAgent = agents.find(a => a.agentId === target.name);
      if (!targetAgent) {
        throw new Error(`Agent ${target.name} not found in network`);
      }
      
      return targetAgent.execute({ task });
    },
    
    listAgents() {
      return registry.list().map(card => ({
        name: card.name,
        skills: card.skills.map(s => s.id),
        endpoint: card.endpoint,
      }));
    },
    
    async shutdown() {
      console.log("[Network] Shutting down...");
      for (const agent of agents) {
        await agent.dispose();
      }
      for (const transport of transports) {
        await transport.close();
      }
      console.log("[Network] All agents stopped");
    },
  };
}
