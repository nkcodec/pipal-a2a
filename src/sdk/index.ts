/**
 * PiPal-A2A SDK
 * 
 * karpathy-clean-code: Public API surface for extension authors.
 * SDK contains ONLY type definitions — no implementation.
 * 
 * Aligned with Google A2A v1.0 protocol.
 * 
 * Import everything from here: import { Task, AgentCard, ... } from 'pipal-a2a/sdk'
 */

// Core types (imported, not duplicated) — Google A2A v1.0 data model
export {
  // Enums
  type TaskState,
  type MessageRole,
  
  // Core data objects
  type Part,
  type Message,
  type TaskStatus,
  type Artifact,
  type Task,
  
  // Agent discovery objects
  type AgentSkill,
  type AgentCapabilities,
  type AgentInterface,
  type AgentProvider,
  type AgentCard,
  
  // Push notifications
  type PushNotificationConfig,
  
  // Factory functions
  createPart,
  createMessage,
  createTask,
  createAgentCard,
  createSkill,
} from '../core/types.js';

import type { AgentCard, Task } from '../core/types.js';

// ─────────────────────────────────────────────────────────────────
// Protocol interfaces (infrastructure implements these)
// ─────────────────────────────────────────────────────────────────

/**
 * Agent registry interface — tracks available agents
 * 
 * Populated dynamically from shared state SSE events.
 */
export interface AgentRegistry {
  register(card: AgentCard): void;
  unregister(agentId: string): void;
  get(agentId: string): AgentCard | undefined;
  findBySkill(skillId: string): AgentCard[];
  list(): AgentCard[];
}

/**
 * Task router interface — routes tasks to agents
 * 
 * Application layer implements default routing.
 * Extension authors can provide custom routers via setStrategy().
 */
export interface TaskRouter {
  route(task: Task): Promise<AgentCard | undefined>;
  setStrategy(strategy: RoutingStrategy): void;
}

/**
 * Routing strategy — how to pick an agent for a task
 * 
 * Default implementation: SkillMatcher (in src/builtin/)
 */
export interface RoutingStrategy {
  select(task: Task, candidates: AgentCard[]): AgentCard | undefined;
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
