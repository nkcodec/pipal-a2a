/**
 * PiPal-A2A Infrastructure — Pi Agent Runtime
 * 
 * karpathy-clean-code: Infrastructure layer.
 * Implements SDK AgentRuntime interface using pi-coding-agent SDK.
 * 
 * Each peer agent creates its own pi session for LLM execution.
 * This is the "brain" of each agent in the P2P network.
 */

import type { AgentRuntime } from "../sdk/index.js";
import type { TaskResult } from "../core/types.js";
import { createTaskResult } from "../core/types.js";

/**
 * PiAgentRuntime — wraps createAgentSession() from pi-coding-agent
 * 
 * Creates a new pi session per task execution for isolation.
 * Future optimization: reuse sessions for same agent.
 */
export class PiAgentRuntime implements AgentRuntime {
  readonly agentId: string;
  private model: string;
  private systemPrompt: string;

  constructor(
    agentId: string,
    options?: {
      model?: string;
      systemPrompt?: string;
    }
  ) {
    this.agentId = agentId;
    this.model = options?.model ?? "anthropic/claude-sonnet-4";
    this.systemPrompt = options?.systemPrompt ?? `You are agent ${agentId}. Execute the task and return results.`;
  }

  async start(): Promise<void> {
    // No persistent session — create per-task for isolation
    console.log(`[PiRuntime:${this.agentId}] Ready (model: ${this.model})`);
  }

  async execute(payload: unknown): Promise<TaskResult> {
    const start = Date.now();
    
    try {
      // Dynamic import — pi-coding-agent may not be available in all environments
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      
      // Create an isolated session for this task
      const { session } = await createAgentSession({
        model: this.model,
        // In-memory session — no persistence needed for agent tasks
      });

      // Send task as user message
      const taskDescription = typeof payload === "string" 
        ? payload 
        : JSON.stringify(payload);
      
      // Use runPrintMode for non-interactive execution
      const response = await session.sendUserMessage(taskDescription);
      
      return createTaskResult(
        crypto.randomUUID(),
        this.agentId,
        "success",
        {
          result: response,
          skills: [],
          durationMs: Date.now() - start,
        }
      );
    } catch (error) {
      return createTaskResult(
        crypto.randomUUID(),
        this.agentId,
        "error",
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - start,
        }
      );
    }
  }

  async dispose(): Promise<void> {
    // No persistent resources to clean up
    console.log(`[PiRuntime:${this.agentId}] Disposed`);
  }
}

// Protocol compliance check at definition time
import type { AgentRuntime as AgentRuntimeType } from "../sdk/index.js";
const _runtime: AgentRuntimeType = new PiAgentRuntime("test");
