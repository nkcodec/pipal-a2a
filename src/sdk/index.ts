/**
 * PiPal-A2A SDK
 * 
 * karpathy-clean-code: Public API surface for extension authors.
 * SDK contains ONLY type definitions — no implementation.
 * 
 * Import everything from here: import { A2AMessage, AgentCard, ... } from 'pipal-a2a/sdk'
 */

// Core types (imported, not duplicated)
export {
  type A2AMessage,
  type TaskResult,
  type AgentCard,
  type Skill,
  type AgentId,
  type TaskId,
  type SkillId,
  type TaskAction,
  type TaskStatus,
  type Endpoint,
  createMessage,
  createTaskResult,
  createAgentCard,
} from '../core/types.js';

import type { A2AMessage, AgentCard, TaskResult } from '../core/types.js';

// ─────────────────────────────────────────────────────────────────
// Protocol interfaces (infrastructure implements these)
// ─────────────────────────────────────────────────────────────────

/**
 * Agent runtime interface
 * 
 * Infrastructure provides implementations: PiAgentRuntime, StubAgentRuntime
 */
export interface AgentRuntime {
  readonly agentId: string;
  
  /** Initialize agent session */
  start(): Promise<void>;
  
  /** Execute a task and return result */
  execute(payload: unknown): Promise<TaskResult>;
  
  /** Cleanup resources */
  dispose(): Promise<void>;
}

/**
 * Transport interface — how agents communicate
 * 
 * Infrastructure implements: A2ATransport (HTTP + SSE)
 */
export interface Transport {
  /** Start listening for messages */
  listen(port: number): Promise<void>;
  
  /** Stop listening */
  close(): Promise<void>;
  
  /** Send message to peer */
  send(message: A2AMessage): Promise<void>;
  
  /** Subscribe to incoming messages */
  onMessage(handler: (message: A2AMessage) => void): void;
  
  /** Subscribe to connection events */
  onConnect(handler: (agentId: string) => void): void;
  onDisconnect(handler: (agentId: string) => void): void;
}

/**
 * Agent registry interface — tracks available agents
 * 
 * Application layer implements this.
 */
export interface AgentRegistry {
  /** Register an agent card */
  register(card: AgentCard): void;
  
  /** Remove an agent */
  unregister(agentId: string): void;
  
  /** Get agent card by ID */
  get(agentId: string): AgentCard | undefined;
  
  /** Find agents with a specific skill */
  findBySkill(skillId: string): AgentCard[];
  
  /** List all registered agents */
  list(): AgentCard[];
}

/**
 * Task router interface — routes tasks to agents
 * 
 * Application layer implements default routing.
 * Extension authors can provide custom routers via setStrategy().
 */
export interface TaskRouter {
  /** Route a task to an agent */
  route(message: A2AMessage): Promise<AgentCard | undefined>;
  
  /** Set custom routing strategy */
  setStrategy(strategy: RoutingStrategy): void;
}

/**
 * Routing strategy — how to pick an agent for a task
 * 
 * Default implementation: SkillMatcher (in src/builtin/)
 */
export interface RoutingStrategy {
  /** Pick best agent for a task */
  select(message: A2AMessage, candidates: AgentCard[]): AgentCard | undefined;
  
  /** Priority for this strategy (higher = runs first) */
  priority: number;
}

/**
 * Message bus interface — pub/sub for local events
 * 
 * Application layer implements this.
 */
export interface MessageBus {
  /** Publish message to subscribers */
  publish(channel: string, data: unknown): void;
  
  /** Subscribe to channel */
  subscribe(channel: string, handler: (data: unknown) => void): () => void;
}

/**
 * Event types for SSE streaming
 */
export type AgentEvent = 
  | { type: "agent:online"; agentId: string; card: AgentCard }
  | { type: "agent:offline"; agentId: string }
  | { type: "task:pending"; taskId: string; agentId: string }
  | { type: "task:thinking"; taskId: string; agentId: string }
  | { type: "task:done"; taskId: string; agentId: string; result: unknown }
  | { type: "task:error"; taskId: string; agentId: string; error: string }
  | { type: "task:delegated"; taskId: string; from: string; to: string }
  | { type: "message:sent"; message: A2AMessage }
  | { type: "message:received"; message: A2AMessage };
