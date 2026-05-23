/**
 * PiPal-A2A Core — Google A2A v1.0 Protocol Data Model
 * 
 * Aligned with: https://github.com/google/A2A specification v1.0
 * 
 * karpathy-clean-code: Frozen core — pure data types, zero infrastructure imports.
 * Core has no knowledge of HTTP, no imports from infrastructure, sdk, or application.
 */

// ─────────────────────────────────────────────────────────────────
// Task State (Google A2A: TaskState enum)
// ─────────────────────────────────────────────────────────────────

export type TaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_AUTH_REQUIRED";

// ─────────────────────────────────────────────────────────────────
// Message Role (Google A2A: Role enum)
// ─────────────────────────────────────────────────────────────────

export type MessageRole = "ROLE_USER" | "ROLE_AGENT";

// ─────────────────────────────────────────────────────────────────
// Part (Google A2A: Part — unified content part)
// ─────────────────────────────────────────────────────────────────

/**
 * A content part in a message.
 * Content type determined by which field is present: text, raw, url, or data.
 */
export interface Part {
  /** Text content */
  readonly text?: string;
  /** Base64-encoded raw bytes */
  readonly raw?: string;
  /** URL to external content */
  readonly url?: string;
  /** Structured data (JSON object) */
  readonly data?: Record<string, unknown>;
  /** MIME type (e.g. "text/plain", "application/json") */
  readonly mediaType?: string;
  /** Filename for file parts */
  readonly filename?: string;
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Message (Google A2A: Message)
// ─────────────────────────────────────────────────────────────────

/**
 * A message in a task conversation.
 * Messages carry parts (text, files, data) between agents.
 */
export interface Message {
  readonly role: MessageRole;
  readonly parts: readonly Part[];
  readonly messageId: string;
  readonly taskId?: string;
  readonly contextId?: string;
  readonly referenceTaskIds?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// TaskStatus (Google A2A: TaskStatus)
// ─────────────────────────────────────────────────────────────────

/**
 * Task status with state, timestamp, and optional status message.
 */
export interface TaskStatus {
  readonly state: TaskState;
  readonly timestamp: string; // ISO 8601 UTC
  readonly message?: Message;
}

// ─────────────────────────────────────────────────────────────────
// Artifact (Google A2A: Artifact)
// ─────────────────────────────────────────────────────────────────

/**
 * An artifact produced by a task (e.g. generated code, reports).
 */
export interface Artifact {
  readonly artifactId: string;
  readonly parts: readonly Part[];
  readonly name?: string;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Task (Google A2A: Task)
// ─────────────────────────────────────────────────────────────────

/**
 * The core Task object — represents a unit of work between agents.
 */
export interface Task {
  readonly id: string;
  readonly contextId?: string;
  readonly status: TaskStatus;
  readonly history?: readonly Message[];
  readonly artifacts?: readonly Artifact[];
  readonly metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// AgentSkill (Google A2A: AgentSkill)
// ─────────────────────────────────────────────────────────────────

/**
 * A declarable capability of an agent.
 * Used for task routing and discovery.
 */
export interface AgentSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags?: readonly string[];
  readonly examples?: readonly string[];
  readonly inputModes?: readonly string[];
  readonly outputModes?: readonly string[];
}

// ─────────────────────────────────────────────────────────────────
// AgentCapabilities (Google A2A: AgentCapabilities)
// ─────────────────────────────────────────────────────────────────

export interface AgentCapabilities {
  readonly streaming?: boolean;
  readonly pushNotifications?: boolean;
  readonly stateTransitionHistory?: boolean;
  readonly extendedAgentCard?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// AgentInterface (Google A2A: AgentInterface — v1.0)
// ─────────────────────────────────────────────────────────────────

export interface AgentInterface {
  readonly url: string;
  readonly protocolBinding: "JSONRPC" | "GRPC" | "HTTP+JSON" | string;
  readonly protocolVersion: string;
}

// ─────────────────────────────────────────────────────────────────
// AgentProvider (Google A2A: AgentProvider)
// ─────────────────────────────────────────────────────────────────

export interface AgentProvider {
  readonly organization: string;
  readonly url?: string;
}

// ─────────────────────────────────────────────────────────────────
// AgentCard (Google A2A: AgentCard — v1.0)
// ─────────────────────────────────────────────────────────────────

/**
 * Public capabilities manifest for an agent.
 * Published at /.well-known/agent-card.json for discovery.
 * 
 * This is the Google A2A v1.0 AgentCard structure.
 * Required fields: name, description, supportedInterfaces, skills
 */
export interface AgentCard {
  readonly name: string;
  readonly description: string;
  readonly supportedInterfaces: readonly AgentInterface[];
  readonly provider?: AgentProvider;
  readonly iconUrl?: string;
  readonly version: string;
  readonly documentationUrl?: string;
  readonly capabilities: AgentCapabilities;
  readonly securitySchemes?: Record<string, unknown>;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly defaultInputModes?: readonly string[];
  readonly defaultOutputModes?: readonly string[];
  readonly skills: readonly AgentSkill[];
}

// ─────────────────────────────────────────────────────────────────
// TaskStatusUpdateEvent (Google A2A: streaming via SSE)
// ─────────────────────────────────────────────────────────────────

/**
 * A streaming event sent via SSE as a task transitions through states.
 * Used for real-time progress updates during task execution.
 */
export interface TaskStatusUpdateEvent {
  readonly taskId: string;
  readonly contextId?: string;
  readonly status: TaskStatus;
  readonly agentName?: string;
}

/**
 * A partial artifact streamed during task execution.
 * Used when results arrive incrementally (e.g. code written, files created).
 */
export interface TaskArtifactUpdateEvent {
  readonly taskId: string;
  readonly contextId?: string;
  readonly artifact: Artifact;
  readonly isFinal?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Factory functions — ensure immutability
// ─────────────────────────────────────────────────────────────────

export function createPart(
  text: string,
  options?: { mediaType?: string; metadata?: Record<string, unknown> }
): Part {
  return Object.freeze({
    text,
    mediaType: options?.mediaType ?? "text/plain",
    metadata: options?.metadata,
  });
}

export function createMessage(
  role: MessageRole,
  parts: readonly Part[],
  options?: {
    taskId?: string;
    contextId?: string;
    referenceTaskIds?: readonly string[];
    metadata?: Record<string, unknown>;
  }
): Message {
  return Object.freeze({
    role,
    parts,
    messageId: crypto.randomUUID(),
    taskId: options?.taskId,
    contextId: options?.contextId,
    referenceTaskIds: options?.referenceTaskIds,
    metadata: options?.metadata,
  });
}

export function createTask(
  id: string,
  state: TaskState,
  options?: {
    contextId?: string;
    statusMessage?: Message;
    history?: readonly Message[];
    artifacts?: readonly Artifact[];
    metadata?: Record<string, unknown>;
  }
): Task {
  return Object.freeze({
    id,
    contextId: options?.contextId,
    status: {
      state,
      timestamp: new Date().toISOString(),
      message: options?.statusMessage,
    },
    history: options?.history,
    artifacts: options?.artifacts,
    metadata: options?.metadata,
  });
}

export function createAgentCard(
  name: string,
  url: string,
  skills: readonly AgentSkill[],
  options?: {
    description?: string;
    version?: string;
    provider?: AgentProvider;
    capabilities?: AgentCapabilities;
  }
): AgentCard {
  return Object.freeze({
    name,
    description: options?.description ?? "",
    supportedInterfaces: Object.freeze([
      Object.freeze({
        url,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      }),
    ]),
    provider: options?.provider,
    version: options?.version ?? "1.0.0",
    capabilities: Object.freeze({
      streaming: options?.capabilities?.streaming ?? true,
      pushNotifications: options?.capabilities?.pushNotifications ?? false,
      stateTransitionHistory: options?.capabilities?.stateTransitionHistory ?? false,
    }),
    skills: Object.freeze(skills),
  });
}

export function createSkill(
  id: string,
  name: string,
  description: string,
  options?: {
    tags?: readonly string[];
    examples?: readonly string[];
  }
): AgentSkill {
  return Object.freeze({
    id,
    name,
    description,
    tags: options?.tags,
    examples: options?.examples,
  });
}

// ─────────────────────────────────────────────────────────────────
// Push Notifications (Google A2A spec §3.1.7-3.1.10)
// ─────────────────────────────────────────────────────────────────

export interface PushNotificationConfig {
  readonly taskId?: string;
  readonly url: string;
  readonly authentication?: {
    readonly scheme: string;
    readonly credentials?: string;
  };
}

// ─────────────────────────────────────────────────────────────────
// Stored Task — extended Task with routing metadata
// ─────────────────────────────────────────────────────────────────

/**
 * A task stored in the shared state, with routing metadata.
 * Extends the base Task with from/to agent and skill hint.
 */
export interface StoredTask extends Task {
  readonly fromAgent: string;
  readonly toAgent: string | null;
  readonly skillHint: string | null;
  readonly taskDescription: string;
}
