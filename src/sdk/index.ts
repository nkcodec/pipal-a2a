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

import type { A2AMessage, AgentCard } from '../core/types.js';

// ─────────────────────────────────────────────────────────────────
// Protocol interfaces
// ─────────────────────────────────────────────────────────────────

/**
 * Agent registry interface — tracks available agents
 * 
 * Application layer implements this.
 * Populated dynamically from shared state SSE events.
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
 * Event types from shared state SSE stream
 */
export type SharedStateEvent =
  | { type: "agent:online"; agentId: string; card: AgentCard }
  | { type: "agent:offline"; agentId: string }
  | { type: "task:created"; taskId: string; from: string; to: string | null; skill: string | null; task: string }
  | { type: "task:completed"; taskId: string; result: unknown }
  | { type: "task:failed"; taskId: string; error: string };
