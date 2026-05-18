/**
 * PiPal-A2A Application — Agent
 * 
 * karpathy-clean-code: Application layer.
 * Runtime instance that handles incoming messages and coordinates execution.
 * No business logic — delegates to AgentRuntime (injected) for LLM work.
 */

import type { 
  A2AMessage, 
  AgentCard,
  AgentRuntime,
  TaskRouter,
  MessageBus,
  Transport,
} from "../sdk/index.js";
import { createMessage, createTaskResult } from "../core/types.js";

/**
 * Agent — runtime instance combining transport + runtime + routing
 * 
 * Each agent runs independently with its own HTTP server.
 * Uses injected Transport for P2P communication (never imports infrastructure directly).
 */
export class Agent {
  readonly agentId: string;
  private runtime: AgentRuntime | null = null;
  private transport: Transport;
  
  constructor(
    private card: AgentCard,
    transport: Transport,
    private router: TaskRouter,
    private messageBus: MessageBus,
    runtime?: AgentRuntime
  ) {
    this.agentId = card.name;
    this.transport = transport;
    this.runtime = runtime || null;
  }
  
  async start(): Promise<void> {
    // Register with local message bus
    this.messageBus.publish("agent:online", {
      type: "agent:online",
      agentId: this.agentId,
      card: this.card,
    });
    
    // Handle incoming messages via transport (injected, not imported)
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
          await this.handleHeartbeat();
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
    
    // Use injected transport to send (never imports infrastructure directly)
    await this.transport.send(delegation);
  }
  
  private async handleHeartbeat(): Promise<void> {
    this.messageBus.publish("agent:online", {
      type: "agent:online",
      agentId: this.agentId,
      card: this.card,
    });
  }
  
  private async handleCancel(message: A2AMessage): Promise<void> {
    console.log(`[Agent:${this.agentId}] Cancel requested for ${message.id}`);
    // TODO: Implement task cancellation (v2 concern)
  }
}
