/**
 * PiPal-A2A Core
 * 
 * karpathy-clean-code: Frozen core — pure data types, zero infrastructure imports.
 * Core has no knowledge of HTTP, no imports from infrastructure, sdk, or application.
 */

export type AgentId = string;
export type TaskId = string;
export type SkillId = string;
export type Endpoint = string;

export type TaskAction = 
  | "execute"       // Request task execution
  | "delegate"      // Forward to another agent
  | "query"         // Ask question / get info
  | "respond"       // Response to query
  | "heartbeat"     // Liveness check
  | "cancel";       // Cancel ongoing task

export type TaskStatus = 
  | "pending"       // Agent picked up task
  | "thinking"      // Agent processing
  | "done"          // Agent completed successfully
  | "error"         // Agent failed
  | "delegated"      // Agent forwarded to peer
  | "cancelled";     // Task was cancelled

/**
 * A2A Message — the fundamental unit of peer-to-peer communication
 * 
 * Core rule: A2AMessage is immutable after creation.
 * No side effects in core — only data structure.
 */
export interface A2AMessage {
  readonly id: string;           // Unique message ID
  readonly from: AgentId;        // Sender agent
  readonly to: AgentId;          // Recipient agent ("*" = broadcast)
  readonly action: TaskAction;   // What to do
  readonly payload: unknown;     // Task data (skill-specific)
  readonly skill?: SkillId;      // Required skill for this task
  readonly correlationId?: string; // For request/response matching
  readonly timestamp: number;    // Unix timestamp (ms)
}

/**
 * Task Result — output from agent after processing a message
 * 
 * Core rule: TaskResult is immutable after creation.
 * Success OR error is set — never both.
 */
export interface TaskResult {
  readonly taskId: string;        // Matches A2AMessage.id
  readonly agentId: AgentId;     // Agent that produced this result
  readonly status: "success" | "error";
  readonly result?: unknown;     // Success payload (skill-specific)
  readonly error?: string;       // Error message (error status only)
  readonly skills: SkillId[];   // Skills used to produce this result
  readonly durationMs: number;   // Execution time
  readonly timestamp: number;    // Unix timestamp (ms)
}

/**
 * Agent Card — public capabilities manifest
 * 
 * Agents publish their card for discovery.
 * Skills declare what this agent can do.
 */
export interface AgentCard {
  readonly name: AgentId;
  readonly version: string;
  readonly description: string;
  readonly skills: Skill[];
  readonly endpoint: Endpoint;
  readonly capabilities: {
    readonly streaming: boolean;  // Supports SSE
    readonly pushNotifications: boolean;
  };
}

/**
 * Skill — declarable capability
 * 
 * Agents declare skills to enable routing.
 * Skill matching is exact at v1 (no partial matching).
 */
export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: unknown;  // JSON Schema for task payload
  readonly outputSchema?: unknown; // JSON Schema for result
}

/**
 * Factory functions — ensure immutability
 */

export function createMessage(
  from: AgentId,
  to: AgentId,
  action: TaskAction,
  payload: unknown,
  options?: {
    skill?: SkillId;
    correlationId?: string;
  }
): A2AMessage {
  return Object.freeze({
    id: crypto.randomUUID(),
    from,
    to,
    action,
    payload,
    skill: options?.skill,
    correlationId: options?.correlationId,
    timestamp: Date.now(),
  });
}

export function createTaskResult(
  taskId: string,
  agentId: AgentId,
  status: "success" | "error",
  options?: {
    result?: unknown;
    error?: string;
    skills?: SkillId[];
    durationMs?: number;
  }
): TaskResult {
  return Object.freeze({
    taskId,
    agentId,
    status,
    result: status === "success" ? options?.result : undefined,
    error: status === "error" ? options?.error : undefined,
    skills: options?.skills || [],
    durationMs: options?.durationMs ?? 0,
    timestamp: Date.now(),
  });
}

export function createAgentCard(
  name: AgentId,
  endpoint: Endpoint,
  skills: Skill[],
  options?: {
    version?: string;
    description?: string;
  }
): AgentCard {
  return Object.freeze({
    name,
    version: options?.version ?? "1.0.0",
    description: options?.description ?? "",
    skills,
    endpoint,
    capabilities: Object.freeze({
      streaming: true,
      pushNotifications: false,
    }),
  });
}