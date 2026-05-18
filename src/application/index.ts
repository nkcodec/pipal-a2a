/**
 * PiPal-A2A Application — Registry & Router
 * 
 * karpathy-clean-code: Application layer.
 * No business logic — only coordinates flow.
 * Imports Core + SDK only.
 */

import type { 
  AgentCard, 
  AgentRegistry, 
  TaskRouter, 
  MessageBus,
  RoutingStrategy,
  A2AMessage,
} from "../sdk/index.js";
import { SkillMatcher } from "../sdk/index.js";
import { createMessage, createTaskResult } from "../core/types.js";

/**
 * InMemoryAgentRegistry — maintains agent cards
 * 
 * Simple Map-based registry.
 * Can be replaced with distributed registry (Redis, etc.) at v2.
 */
export class InMemoryAgentRegistry implements AgentRegistry {
  private agents = new Map<string, AgentCard>();
  
  register(card: AgentCard): void {
    this.agents.set(card.name, card);
    console.log(`[Registry] Registered agent: ${card.name} (${card.skills.map(s => s.id).join(", ")})`);
  }
  
  unregister(agentId: string): void {
    this.agents.delete(agentId);
    console.log(`[Registry] Unregistered agent: ${agentId}`);
  }
  
  get(agentId: string): AgentCard | undefined {
    return this.agents.get(agentId);
  }
  
  findBySkill(skillId: string): AgentCard[] {
    return Array.from(this.agents.values()).filter(card =>
      card.skills.some(skill => skill.id === skillId)
    );
  }
  
  list(): AgentCard[] {
    return Array.from(this.agents.values());
  }
}

/**
 * DefaultTaskRouter — routes tasks to agents based on skills
 * 
 * Uses SkillMatcher by default.
 * Custom strategies can be injected.
 */
export class DefaultTaskRouter implements TaskRouter {
  private strategy: RoutingStrategy;
  
  constructor(
    private registry: AgentRegistry,
    customStrategy?: RoutingStrategy
  ) {
    this.strategy = customStrategy ?? new SkillMatcher();
  }
  
  async route(message: A2AMessage): Promise<AgentCard | undefined> {
    const { to, skill } = message;
    
    // Direct routing — if "to" is specified, use it directly
    if (to !== "*") {
      const target = this.registry.get(to);
      if (target) return target;
    }
    
    // Skill-based routing — find agents with required skill
    if (skill) {
      const candidates = this.registry.findBySkill(skill);
      if (candidates.length > 0) {
        return this.strategy.select(message, candidates);
      }
    }
    
    // Fallback — pick any available agent
    const allAgents = this.registry.list();
    if (allAgents.length > 0) {
      return this.strategy.select(message, allAgents);
    }
    
    return undefined; // No agent available
  }
  
  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
  }
}

/**
 * Agent — runtime instance combining transport + runtime + routing
 * 
 * This is the main building block.
 * Each agent runs independently with its own HTTP server.
 */
export class Agent {
  readonly agentId: string;
  private runtime: import("../sdk/index.js").AgentRuntime | null = null;
  
  constructor(
    private card: AgentCard,
    private transport: import("../sdk/index.js").Transport,
    private router: TaskRouter,
    private messageBus: MessageBus,
    runtime?: import("../sdk/index.js").AgentRuntime
  ) {
    this.agentId = card.name;
    this.runtime = runtime || null;
  }
  
  async start(): Promise<void> {
    // Register with local message bus
    this.messageBus.publish("agent:online", {
      type: "agent:online",
      agentId: this.agentId,
      card: this.card,
    });
    
    // Handle incoming messages
    this.transport.onMessage(async (message: A2AMessage) => {
      console.log(`[Agent:${this.agentId}] Received: ${message.action} from ${message.from}`);
      
      this.messageBus.publish("message:received", message);
      
      switch (message.action) {
        case "execute":
        case "query":
          await this.handleTask(message);
          break;
        case "delegate":
          await this.handleDelegate(message);
          break;
        case "heartbeat":
          await this.handleHeartbeat(message);
          break;
        case "cancel":
          await this.handleCancel(message);
          break;
      }
    });
  }
  
  async execute(task: unknown): Promise<import("../core/types.js").TaskResult> {
    if (!this.runtime) {
      throw new Error(`Agent ${this.agentId} has no runtime configured`);
    }
    
    const taskId = crypto.randomUUID();
    this.messageBus.publish("task:pending", {
      type: "task:pending",
      taskId,
      agentId: this.agentId,
    });
    
    try {
      this.messageBus.publish("task:thinking", {
        type: "task:thinking",
        taskId,
        agentId: this.agentId,
      });
      
      const result = await this.runtime.execute(task);
      
      this.messageBus.publish("task:done", {
        type: "task:done",
        taskId,
        agentId: this.agentId,
        result: result.result,
      });
      
      return result;
    } catch (error) {
      const result = createTaskResult(taskId, this.agentId, "error", {
        error: String(error),
      });
      
      this.messageBus.publish("task:error", {
        type: "task:error",
        taskId,
        agentId: this.agentId,
        error: String(error),
      });
      
      return result;
    }
  }
  
  async dispose(): Promise<void> {
    if (this.runtime) {
      await this.runtime.dispose();
    }
    
    this.messageBus.publish("agent:offline", {
      type: "agent:offline",
      agentId: this.agentId,
    });
  }
  
  private async handleTask(message: A2AMessage): Promise<void> {
    this.messageBus.publish("task:pending", {
      type: "task:pending",
      taskId: message.id,
      agentId: this.agentId,
    });
    
    this.messageBus.publish("task:thinking", {
      type: "task:thinking",
      taskId: message.id,
      agentId: this.agentId,
    });
    
    if (!this.runtime) {
      createTaskResult(message.id, this.agentId, "error", {
        error: "Agent has no runtime",
      });
      this.messageBus.publish("task:error", {
        type: "task:error",
        taskId: message.id,
        agentId: this.agentId,
        error: "Agent has no runtime",
      });
      return;
    }
    
    try {
      const result = await this.runtime.execute(message.payload);
      
      this.messageBus.publish("task:done", {
        type: "task:done",
        taskId: message.id,
        agentId: this.agentId,
        result: result.result,
      });
    } catch (error) {
      this.messageBus.publish("task:error", {
        type: "task:error",
        taskId: message.id,
        agentId: this.agentId,
        error: String(error),
      });
    }
  }
  
  private async handleDelegate(message: A2AMessage): Promise<void> {
    // Route to another agent
    const target = await this.router.route(message);
    
    if (!target) {
      this.messageBus.publish("task:error", {
        type: "task:error",
        taskId: message.id,
        agentId: this.agentId,
        error: "No agent available for delegation",
      });
      return;
    }
    
    const delegation = createMessage(this.agentId, target.name, "execute", message.payload, {
      skill: message.skill,
      correlationId: message.id,
    });
    
    this.messageBus.publish("task:delegated", {
      type: "task:delegated",
      taskId: message.id,
      from: this.agentId,
      to: target.name,
    });
    
    // Send to target agent
    const { A2AClient } = await import("../infrastructure/transport.js");
    const client = new A2AClient(target.endpoint);
    await client.send(delegation);
  }
  
  private async handleHeartbeat(_message: A2AMessage): Promise<void> {
    // Respond with heartbeat ack
    this.messageBus.publish("agent:online", {
      type: "agent:online",
      agentId: this.agentId,
      card: this.card,
    });
  }
  
  private async handleCancel(message: A2AMessage): Promise<void> {
    // TODO: Implement task cancellation
    console.log(`[Agent:${this.agentId}] Cancel requested for ${message.id}`);
  }
}