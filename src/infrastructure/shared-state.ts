/**
 * PiPal-A2A Infrastructure — Shared State Server + Client
 *
 * HTTP rendezvous for P2P agent network.
 * Agent registration: REST (P2P extension, not in A2A spec)
 * Task operations: JSON-RPC 2.0 (Google A2A spec §9)
 *
 * Single /rpc endpoint handles all task methods:
 *   POST /rpc  { "jsonrpc": "2.0", "method": "tasks/sendMessage", "params": {...}, "id": 1 }
 *
 * Agent discovery remains REST for simplicity:
 *   GET /agents     — list all agents
 *   POST /register  — register agent
 */

import express, { type Request, type Response } from "express";
import type { AgentCard, Task, TaskState } from "../core/types.js";
import { createTask } from "../core/types.js";
import {
  JsonRpcDispatcher,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  JSONRPC_CODES,
} from "./jsonrpc.js";

// ─────────────────────────────────────────────────────────────────
// Stored Task
// ─────────────────────────────────────────────────────────────────

export interface StoredTask extends Task {
  readonly fromAgent: string;
  readonly toAgent: string | null;
  readonly skillHint: string | null;
  readonly taskDescription: string;
}

// ─────────────────────────────────────────────────────────────────
// JSON-RPC Helpers
// ─────────────────────────────────────────────────────────────────

function errorResp(id: number | string | null, err: JsonRpcError): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: err };
}

function okResp(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function taskNotFound(id: number | string | null, taskId: string): JsonRpcResponse {
  return errorResp(id, {
    code: JSONRPC_CODES.TASK_NOT_FOUND,
    message: `Task '${taskId}' not found`,
  });
}

// ─────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────

export class SharedStateServer {
  private app = express();
  private server: ReturnType<typeof this.app.listen> | null = null;
  private agents = new Map<string, AgentCard>();
  private tasks = new Map<string, StoredTask>();
  private sseClients = new Map<string, Response>();
  private taskStreams = new Map<string, { res: Response; taskId: string }>();
  private validApiKeys = new Set<string>();

  // JSON-RPC dispatcher for task methods
  private rpc = new JsonRpcDispatcher();

  async start(port: number): Promise<string> {
    this.app.use(express.json());
    this.setupAgentRoutes();
    this.setupRpcRoutes();
    this.setupSseRoutes();

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        const url = `http://localhost:${port}`;
        console.log(`[SharedState] Rendezvous server at ${url}`);
        resolve(url);
      });
      this.server.on("error", reject);
    });
  }

  /**
   * Add an API key to the allowed list. Must be called before the server starts.
   * When keys are present, all incoming requests must include a valid key.
   */
  addApiKey(key: string): void {
    this.validApiKeys.add(key);
  }

  /**
   * Returns true if API key auth is enabled (at least one key registered).
   */
  get authEnabled(): boolean {
    return this.validApiKeys.size > 0;
  }

  private authMiddleware = (req: any, res: Response, next: () => void): void => {
    // No keys configured → allow all
    if (this.validApiKeys.size === 0) { next(); return; }

    const key = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!key || !this.validApiKeys.has(key)) {
      res.status(401).json({ error: "Unauthorized: valid API key required" });
      return;
    }
    next();
  };

  async stop(): Promise<void> {
    for (const { res } of this.sseClients.values()) res.end();
    this.sseClients.clear();
    for (const { res } of this.taskStreams.values()) res.end();
    this.taskStreams.clear();
    return new Promise((resolve, reject) => {
      this.server?.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // ── Agent Routes (REST — P2P extension) ─────────────────────────

  private setupAgentRoutes(): void {
    // Well-known discovery — public, no auth required (Google A2A spec §8)
    this.app.get("/.well-known/agent-card.json", (_req: Request, res: Response) => {
      res.setHeader("A2A-Version", "1.0");
      res.setHeader("Content-Type", "application/json");
      const cards = Array.from(this.agents.values());
      res.json(cards);
    });

    this.app.get("/agents/:name", this.authMiddleware, (req: Request, res: Response) => {
      const card = this.agents.get(req.params.name);
      if (!card) return res.status(404).json({ error: "Agent not found" });
      res.setHeader("A2A-Version", "1.0");
      res.json(card);
    });

    this.app.get("/agents", this.authMiddleware, (_req: Request, res: Response) => {
      res.setHeader("A2A-Version", "1.0");
      res.json(Array.from(this.agents.values()));
    });

    this.app.post("/register", this.authMiddleware, (req: Request, res: Response) => {
      const card = req.body as AgentCard;
      if (!card?.name) {
        res.status(400).json({ error: "AgentCard requires name" });
        return;
      }
      this.agents.set(card.name, card);
      this.broadcast("agent:online", { agentId: card.name, card });
      console.log(`[SharedState] Agent registered: ${card.name}`);
      res.json({ ok: true, agentId: card.name });
    });

    this.app.post("/unregister", this.authMiddleware, (req: Request, res: Response) => {
      const { agentId } = req.body;
      if (agentId) {
        this.agents.delete(agentId);
        this.broadcast("agent:offline", { agentId });
        console.log(`[SharedState] Agent left: ${agentId}`);
      }
      res.json({ ok: true });
    });
  }

  // ── JSON-RPC Task Routes (Google A2A spec §9) ───────────────────

  private setupRpcRoutes(): void {
    // tasks/sendMessage — create a new task
    this.rpc.register("tasks/sendMessage", async (params) => {
      const { task, skill, to, id: reqId, contextId } = params as {
        task?: string;
        skill?: string;
        to?: string;
        id?: string;
        contextId?: string;
      };
      if (!task) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "task is required" };

      // Get agentName from params if provided (for A2A compliance)
      const agentName = (params as Record<string, unknown>).agentName as string | undefined;

      // For now, from/to are in params — stored as routing metadata
      const fromAgent = agentName || "anonymous";

      // contextId links multi-turn conversations (Google A2A spec §3.4)
      const ctxId = contextId || crypto.randomUUID();

      const stored: StoredTask = {
        ...createTask(crypto.randomUUID(), "TASK_STATE_SUBMITTED", { contextId: ctxId }),
        fromAgent,
        toAgent: to || null,
        skillHint: skill || null,
        taskDescription: task,
      };

      this.tasks.set(stored.id, stored);
      this.broadcast("task:created", {
        taskId: stored.id,
        from: stored.fromAgent,
        to: stored.toAgent,
        skill: stored.skillHint,
        task: stored.taskDescription,
      });
      console.log(
        `[SharedState] Task ${stored.id.slice(0, 8)}: ${fromAgent} → ${to || "any"} "${task.slice(0, 40)}..."`
      );

      // Return A2A SendMessage result: full task object
      return { taskId: stored.id, task: stored };
    });

    // tasks/getTask — retrieve a task
    this.rpc.register("tasks/getTask", async (params) => {
      const { taskId } = params as { taskId?: string };
      if (!taskId) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required" };

      const task = this.tasks.get(taskId);
      if (!task) return { task: null };
      return { task };
    });

    // tasks/cancelTask — cancel a task
    this.rpc.register("tasks/cancelTask", async (params) => {
      const { taskId } = params as { taskId?: string };
      if (!taskId) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required" };

      const task = this.tasks.get(taskId);
      if (!task) return { task: null };
      if (task.status.state === "TASK_STATE_COMPLETED") {
        return {
          error: {
            code: JSONRPC_CODES.TASK_NOT_CANCELABLE,
            message: `Task '${taskId}' is already completed`,
          },
        };
      }

      const updated: StoredTask = {
        ...task,
        status: {
          state: "TASK_STATE_CANCELED",
          timestamp: new Date().toISOString(),
        },
      };
      this.tasks.set(taskId, updated);
      this.broadcast("task:failed", { taskId, error: "Task was cancelled" });
      return { task: updated };
    });

    // tasks/resolveTask — post a result (called by completing agent)
    this.rpc.register("tasks/resolveTask", async (params) => {
      const { taskId, state, result, error } = params as {
        taskId?: string;
        state?: TaskState;
        result?: unknown;
        error?: string;
      };
      if (!taskId) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required" };

      const task = this.tasks.get(taskId);
      if (!task) return { task: null };

      const finalState = state ?? "TASK_STATE_COMPLETED";
      const updated: StoredTask = {
        ...task,
        status: {
          state: finalState,
          timestamp: new Date().toISOString(),
        },
        artifacts: result
          ? [
              {
                artifactId: crypto.randomUUID(),
                parts: [{ text: String(result), mediaType: "text/plain" }],
              },
            ]
          : undefined,
        metadata: {
          ...task.metadata,
          error,
        },
      };

      this.tasks.set(taskId, updated);

      // Broadcast streaming events for task subscription
      this.broadcastToTask(taskId, "task_update", {
        status: updated.status,
        artifacts: updated.artifacts,
      });

      if (finalState === "TASK_STATE_COMPLETED") {
        this.broadcast("task:completed", { taskId: updated.id, result });
        this.broadcastToTask(taskId, "task_completed", { result });
      } else if (finalState === "TASK_STATE_FAILED") {
        this.broadcast("task:failed", { taskId: updated.id, error });
        this.broadcastToTask(taskId, "task_failed", { error });
      } else if (finalState === "TASK_STATE_CANCELED") {
        this.broadcast("task:failed", { taskId: updated.id, error: "Task was cancelled" });
        this.broadcastToTask(taskId, "task_failed", { error: "Task was cancelled" });
      }

      console.log(`[SharedState] Task ${updated.id.slice(0, 8)} → ${finalState}`);
      return { task: updated };
    });

    // tasks/listTasks — list tasks (optionally filtered by agent)
    this.rpc.register("tasks/listTasks", async (params) => {
      const { agentName } = params as { agentName?: string };
      const all = Array.from(this.tasks.values());
      if (agentName) {
        return { tasks: all.filter((t) => t.fromAgent === agentName || t.toAgent === agentName) };
      }
      return { tasks: all };
    });

    // tasks/streamChunk — stream a text chunk for a running task (SSE broadcast)
    this.rpc.register("tasks/streamChunk", async (params) => {
      const { taskId, chunk } = params as { taskId?: string; chunk?: string };
      if (!taskId) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required" };
      if (!chunk) return { ok: true }; // empty chunk, skip

      const task = this.tasks.get(taskId);
      if (!task) throw { code: JSONRPC_CODES.TASK_NOT_FOUND, message: `Task ${taskId} not found` };

      // Broadcast artifact_update SSE event to task subscribers
      this.broadcastToTask(taskId, "artifact_update", {
        taskId,
        chunk,
        timestamp: new Date().toISOString(),
      });

      return { ok: true };
    });

    // tasks/addMessage — append a follow-up message to an existing task
    // Google A2A spec §3.4: multi-turn conversations via contextId
    this.rpc.register("tasks/addMessage", async (params) => {
        const { taskId, message, role, requireInput } = params as {
        taskId?: string;
        message?: string;
        role?: string;
        requireInput?: boolean;
      };
      if (!taskId) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required" };
      if (!message) throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "message is required" };

      const task = this.tasks.get(taskId);
      if (!task) throw { code: JSONRPC_CODES.TASK_NOT_FOUND, message: `Task ${taskId} not found` };

      const msg = {
        role: role === "ROLE_AGENT" ? "ROLE_AGENT" as const : "ROLE_USER" as const,
        parts: [{ text: message, mediaType: "text/plain" }],
        messageId: crypto.randomUUID(),
        taskId,
        contextId: task.contextId,
      };

      const history = [...(task.history || []), msg];
      // If agent asks for input → INPUT_REQUIRED. If user responds → back to WORKING.
      let newState: TaskState;
      if (requireInput) {
        newState = "TASK_STATE_INPUT_REQUIRED";
      } else if (task.status.state === "TASK_STATE_INPUT_REQUIRED" && role === "ROLE_USER") {
        newState = "TASK_STATE_WORKING";
      } else {
        newState = task.status.state;
      }

      const updated: StoredTask = {
        ...task,
        history,
        status: { state: newState, timestamp: new Date().toISOString() },
      };
      this.tasks.set(taskId, updated);

      this.broadcastToTask(taskId, "task_update", {
        status: updated.status,
        historyLength: history.length,
      });
      this.broadcast("task:message", { taskId, from: role, message });

      console.log(`[SharedState] Task ${taskId.slice(0, 8)} +message (${role}): "${message.slice(0, 40)}..."`);
      return { task: updated };
    });

    // ── JSON-RPC POST /rpc endpoint ────────────────────────────────

    this.app.post("/rpc", this.authMiddleware, async (req: Request, res: Response) => {
      res.setHeader("A2A-Version", "1.0");
      res.setHeader("Content-Type", "application/json");

      const body = req.body;

      // Batch request
      if (Array.isArray(body)) {
        const responses = await this.rpc.dispatchBatch(body as JsonRpcRequest[]);
        res.json(responses);
        return;
      }

      // Single request
      try {
        const response = await this.rpc.dispatch(body as JsonRpcRequest);
        res.json(response);
      } catch (err: unknown) {
        res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(err) }});
      }
    });
  }

  // ── SSE Routes (unchanged — used for event subscription) ────────

  private setupSseRoutes(): void {
    this.app.get("/events", this.authMiddleware, (req: Request, res: Response) => {
      const clientId = (req.query.clientId as string) || crypto.randomUUID();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
      this.sseClients.set(clientId, res);

      req.on("close", () => {
        clearInterval(heartbeat);
        this.sseClients.delete(clientId);
      });

      res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);
    });

    // ── Streaming SSE for specific task (Google A2A: task subscription) ──

    this.app.get("/tasks/:taskId/streams", this.authMiddleware, (req: Request, res: Response) => {
      const taskId = req.params.taskId;
      const clientId = (req.query.clientId as string) || crypto.randomUUID();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("A2A-Version", "1.0");

      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
      this.taskStreams.set(clientId, { res, taskId });

      // Send current task state immediately
      const task = this.tasks.get(taskId);
      if (task) {
        res.write(`event: task_update\ndata: ${JSON.stringify({ taskId: task.id, status: task.status })}\n\n`);
      }

      req.on("close", () => {
        clearInterval(heartbeat);
        this.taskStreams.delete(clientId);
      });

      res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);

      // Catch-up: if task is already terminal, send final event
      const t2 = this.tasks.get(taskId);
      if (t2) {
        const s = t2.status.state;
        if (s === "TASK_STATE_COMPLETED") {
          res.write(`event: task_completed\ndata: ${JSON.stringify({ taskId, result: t2.artifacts?.[0]?.parts?.[0]?.text })}\n\n`);
        } else if (s === "TASK_STATE_FAILED") {
          res.write(`event: task_failed\ndata: ${JSON.stringify({ taskId, error: t2.metadata?.error })}\n\n`);
        }
      }
    });

    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({
        ok: true,
        agents: this.agents.size,
        tasks: this.tasks.size,
        agentNames: Array.from(this.agents.keys()),
      });
    });
  }

  private broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify(data);
    for (const res of this.sseClients.values()) {
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    }
    // taskStreams are per-task — use broadcastToTask instead
  }

  private broadcastToTask(taskId: string, event: string, data: unknown): void {
    console.log(`[broadcastToTask] ${event} for ${taskId.slice(0,8)}, streams: ${this.taskStreams.size}`);
    const payload = JSON.stringify({ taskId, ...data });
    for (const [cid, entry] of this.taskStreams) {
      console.log(`  stream ${cid.slice(0,8)}: taskId=${entry.taskId.slice(0,8)} match=${entry.taskId === taskId}`);
      if (entry.taskId === taskId) {
        console.log(`  -> writing to ${cid.slice(0,8)}`);
        entry.res.write(`event: ${event}
data: ${payload}

`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────

export class SharedStateClient {
  private baseUrl: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    if (apiKey) this.apiKey = apiKey;
  }

  private apiKey?: string;

  async isReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async register(card: AgentCard): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const r = await fetch(`${this.baseUrl}/register`, {
      method: "POST",
      headers,
      body: JSON.stringify(card),
    });
    if (!r.ok) throw new Error(`Register failed: ${r.status} ${r.statusText}`);
  }

  async unregister(agentId: string): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    await fetch(`${this.baseUrl}/unregister`, {
      method: "POST",
      headers,
      body: JSON.stringify({ agentId }),
    });
  }

  async listAgents(): Promise<AgentCard[]> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const r = await fetch(`${this.baseUrl}/agents`, { headers });
    if (!r.ok) throw new Error(`List agents failed: ${r.status} ${r.statusText}`);
    return r.json() as Promise<AgentCard[]>;
  }

  /**
   * Discover agents via well-known endpoint (Google A2A spec §8).
   * No auth required — public discovery.
   */
  async discover(): Promise<AgentCard[]> {
    const r = await fetch(`${this.baseUrl}/.well-known/agent-card.json`);
    if (!r.ok) throw new Error(`Discovery failed: ${r.status} ${r.statusText}`);
    return r.json() as Promise<AgentCard[]>;
  }

  // ── JSON-RPC call helper ────────────────────────────────────────

  private async rpcCall<T = unknown>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const r = await fetch(`${this.baseUrl}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "A2A-Version": "1.0",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: crypto.randomUUID(),
      }),
    });
    if (!r.ok) throw new Error(`JSON-RPC call failed: ${r.statusText}`);

    const resp = (await r.json()) as { jsonrpc: string; result?: T; error?: { code: number; message: string } };
    if (resp.error) throw new Error(`JSON-RPC error: ${resp.error.message} (${resp.error.code}) (${r.status})`);
    return resp.result as T;
  }

  // ── Task Operations (JSON-RPC 2.0) ──────────────────────────────

  async createTask(params: {
    from: string;
    to?: string;
    skill?: string;
    task: string;
    contextId?: string;
  }): Promise<string> {
    const { taskId } = (await this.rpcCall<{ taskId: string; task: StoredTask }>(
      "tasks/sendMessage",
      {
        task: params.task,
        to: params.to,
        skill: params.skill,
        agentName: params.from,
        contextId: params.contextId,
      }
    ));
    return taskId;
  }

  async getTask(taskId: string): Promise<StoredTask> {
    const { task } = (await this.rpcCall<{ task: StoredTask | null }>(
      "tasks/getTask",
      { taskId }
    ));
    if (!task) throw new Error(`Task '${taskId}' not found`);
    return task;
  }

  async cancelTask(taskId: string): Promise<StoredTask | null> {
    const { task } = (await this.rpcCall<{ task: StoredTask | null }>(
      "tasks/cancelTask",
      { taskId }
    ));
    return task;
  }

  async listTasks(agentName?: string): Promise<StoredTask[]> {
    const { tasks } = (await this.rpcCall<{ tasks: StoredTask[] }>(
      "tasks/listTasks",
      { agentName: agentName || "" }
    ));
    return tasks;
  }

  async postResult(taskId: string, result: unknown): Promise<void> {
    await this.rpcCall("tasks/resolveTask", {
      taskId,
      state: "TASK_STATE_COMPLETED",
      result,
    });
  }

  async postError(taskId: string, error: string): Promise<void> {
    await this.rpcCall("tasks/resolveTask", {
      taskId,
      state: "TASK_STATE_FAILED",
      error,
    });
  }

  async streamChunk(taskId: string, chunk: string): Promise<void> {
    await this.rpcCall("tasks/streamChunk", { taskId, chunk });
  }

  async sendFollowUp(taskId: string, message: string, options?: { role?: string; requireInput?: boolean }): Promise<StoredTask> {
    const { task } = (await this.rpcCall<{ task: StoredTask }>("tasks/addMessage", {
      taskId,
      message,
      role: options?.role ?? "ROLE_USER",
      requireInput: options?.requireInput ?? false,
    }));
    return task;
  }

  private _authHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  subscribe(handler: (event: string, data: unknown) => void): () => void {
    const controller = new AbortController();
    let closed = false;

    const connect = async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/events?clientId=${crypto.randomUUID()}`,
          { headers: this._authHeaders(), signal: controller.signal }
        );
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const raw = line.slice(6);
              try {
                handler(currentEvent, JSON.parse(raw));
              } catch {
                handler(currentEvent, raw);
              }
              currentEvent = "message";
            }
          }
        }
      } catch (error) {
        if (!closed && !(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[SharedStateClient] SSE connection closed:", error.message ?? error);
        }
      }
    };

    connect();
    return () => {
      closed = true;
      controller.abort();
    };
  }

  async waitForResult(taskId: string, options?: { timeout?: number }): Promise<StoredTask> {
    const timeout = options?.timeout ?? 120_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
                reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
      }, timeout);
      let completed = false;
            const unsub = this.subscribeToTask(taskId, (event, data) => {
                if (completed) return;
        if (event === "task_completed" || event === "task_failed") {
          completed = true;
          clearTimeout(timer);
          unsub();
          this.getTask(taskId).then(resolve).catch(reject);
        }
      });
    });
  }

  subscribeToTask(
    taskId: string,
    onEvent: (event: string, data: unknown) => void,
  ): () => void {
    const controller = new AbortController();
    let currentEvent = "message";

    fetch(this.baseUrl + "/tasks/" + taskId + "/streams?clientId=" + crypto.randomUUID(), { headers: this._authHeaders(), signal: controller.signal })
      .then((response) => {
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        function process() {
          reader.read().then(({ done, value }: { done: boolean; value: Uint8Array }) => {
            if (done || controller.signal.aborted) return;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                try { onEvent(currentEvent, JSON.parse(line.slice(6))); } catch { onEvent(currentEvent, line.slice(6)); }
              }
            }
            process();
          }).catch(() => {
            // read aborted or failed
          });
        }
        process();
      })
      .catch(() => {});

    return () => { controller.abort(); };
  }

}
