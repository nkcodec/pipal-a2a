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
import type { AgentCard, Task, TaskState, PushNotificationConfig, StoredTask } from "../core/types.js";
import { createTask } from "../core/types.js";
import {
  JsonRpcDispatcher,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  JSONRPC_CODES,
} from "./jsonrpc.js";
import { StateStore } from "./state-store.js";

// Removed dead helper functions: errorResp, okResp, taskNotFound — never called

// ─────────────────────────────────────────────────────────────────
// SSRF Protection — Webhook URL validation
// ─────────────────────────────────────────────────────────────────

function isValidWebhookUrl(url: string, allowLocalhost: boolean = false): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only allow http: and https: schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();

  // Block loopback (SSRF protection — webhook targets must be external)
  if (!allowLocalhost && (host === '127.0.0.1' || host === 'localhost' || host === '::1')) return false;

  // Block private networks (RFC 1918)
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return false;

  // Block wildcards
  if (host === '0.0.0.0' || host === '[::]') return false;

  // Block cloud metadata endpoint (AWS/GCP/Azure)
  if (host === '169.254.169.254') return false;

  // Block link-local
  if (host.startsWith('169.254.') || host.startsWith('fe80:')) return false;

  // Block obvious non-HTTP ports on internal services
  const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  const blockedPorts = [22, 23, 25, 3306, 5432, 6379, 27017]; // SSH, telnet, SMTP, MySQL, Postgres, Redis, Mongo
  if (blockedPorts.includes(port)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────

export class SharedStateServer {
  private app = express();
  private server: ReturnType<typeof this.app.listen> | null = null;
  private store: StateStore;
  private sseClients = new Map<string, { res: Response; heartbeat: ReturnType<typeof setInterval>; agentId?: string }>();
  private taskStreams = new Map<string, { res: Response; taskId: string; heartbeat: ReturnType<typeof setInterval> }>();
  private taskLocks = new Map<string, Promise<void>>(); // per-task mutex
  private allowLocalhost: boolean = false;
  private validApiKeys = new Set<string>();

  constructor(private readonly options: { dbPath?: string; apiKeys?: string[] } = {}) {
    this.store = new StateStore(options.dbPath || ".pipal-a2a/state.db");
    if (options.apiKeys) {
      for (const key of options.apiKeys) this.validApiKeys.add(key);
    }
  }

  // JSON-RPC dispatcher for task methods
  private rpc = new JsonRpcDispatcher();

  // Per-task mutex — prevents concurrent state mutations
  private async withTaskLock<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.taskLocks.get(taskId) ?? Promise.resolve();
    let release: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    this.taskLocks.set(taskId, next);
    await prev;
    try {
      return await fn();
    } finally {
      release!();
      if (this.taskLocks.get(taskId) === next) this.taskLocks.delete(taskId);
    }
  }
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  async start(port: number, host: string = "127.0.0.1"): Promise<string> {
    this.allowLocalhost = host === "127.0.0.1";

    // Ensure DB directory exists
    const dbPath = this.options.dbPath || ".pipal-a2a/state.db";
    const dir = dbPath.includes("/") ? dbPath.substring(0, dbPath.lastIndexOf("/")) : null;
    if (dir) {
      const fs = await import("fs");
      fs.mkdirSync(dir, { recursive: true });
    }
    await this.store.init();

    this.app.use(express.json({ limit: '1mb' }));
    this.setupAgentRoutes();
    this.setupPushRoutes();
    this.setupRpcRoutes();
    this.setupSseRoutes();
    this.setupHealthRoutes();

    // Periodic cleanup: prune completed tasks older than 1 hour
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, () => {
        const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
        console.log(`[SharedState] Rendezvous server at ${url} (${host})`);
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

  /**
   * Remove completed/failed/canceled tasks older than 1 hour.
   * Remove SSE clients whose connections have died.
   */
  private cleanup(): void {
    const TASK_TTL_MS = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    const terminalStates = new Set(["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED"]);

    // Prune old terminal tasks
    let pruned = 0;
    for (const task of this.store.listTasks()) {
      if (terminalStates.has(task.status.state)) {
        const age = now - new Date(task.status.timestamp).getTime();
        if (age > TASK_TTL_MS) {
          this.store.deleteTask(task.id);
          pruned++;
        }
      }
    }
    if (pruned > 0) console.log(`[Cleanup] Pruned ${pruned} expired task(s)`);
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    for (const { res } of this.sseClients.values()) res.end();
    this.sseClients.clear();
    for (const { res } of this.taskStreams.values()) res.end();
    this.taskStreams.clear();
    this.store.close();
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
      const cards = this.store.listAgents();
      res.json(cards);
    });

    this.app.get("/agents/:name", this.authMiddleware, (req: Request, res: Response) => {
      const card = this.store.getAgent(req.params.name);
      if (!card) return res.status(404).json({ error: "Agent not found" });
      res.setHeader("A2A-Version", "1.0");
      res.json(card);
    });

    this.app.get("/agents", this.authMiddleware, (_req: Request, res: Response) => {
      res.setHeader("A2A-Version", "1.0");
      res.json(this.store.listAgents());
    });

    this.app.post("/register", this.authMiddleware, (req: Request, res: Response) => {
      const card = req.body as AgentCard;
      if (!card?.name) {
        res.status(400).json({ error: "AgentCard requires name" });
        return;
      }
      const existing = this.store.getAgent(card.name);
      if (existing) {
        // Same agent reconnecting (crash recovery or restart) — update card
        this.store.setAgent(card);
        console.log(`[SharedState] Agent re-registered: ${card.name}`);
        res.json({ ok: true, agentId: card.name, recovered: true });
        return;
      }
      this.store.setAgent(card);
      this.broadcast("agent:online", { agentId: card.name, card });
      console.log(`[SharedState] Agent registered: ${card.name}`);
      res.json({ ok: true, agentId: card.name });
    });

    this.app.post("/unregister", this.authMiddleware, (req: Request, res: Response) => {
      const { agentId } = req.body;
      if (agentId) {
        this.store.deleteAgent(agentId);
        this.broadcast("agent:offline", { agentId });
        console.log(`[SharedState] Agent left: ${agentId}`);
      }
      res.json({ ok: true });
    });
  }

  // ── Push Notification Routes (Google A2A spec §3.1.7-3.1.10) ─────

  private setupPushRoutes(): void {
    // Create
    this.app.post("/push-configs", this.authMiddleware, (req: Request, res: Response) => {
      const config = req.body as PushNotificationConfig;
      if (!config?.url) {
        res.status(400).json({ error: "PushNotificationConfig requires url" });
        return;
      }
      if (!isValidWebhookUrl(config.url, this.allowLocalhost)) {
        res.status(400).json({ error: "Invalid webhook URL: must be public http(s), no private/loopback IPs" });
        return;
      }
      const id = crypto.randomUUID();
      this.store.setPushConfig(id, config);
      console.log(`[Push] Config created: ${id} → ${config.url}`);
      res.setHeader("A2A-Version", "1.0");
      res.json({ id, ...config });
    });

    // List
    this.app.get("/push-configs", this.authMiddleware, (_req: Request, res: Response) => {
      const configs = this.store.listPushConfigs().map(({ id, config }) => ({ id, ...config }));
      res.setHeader("A2A-Version", "1.0");
      res.json(configs);
    });

    // Get
    this.app.get("/push-configs/:id", this.authMiddleware, (req: Request, res: Response) => {
      const config = this.store.getPushConfig(req.params.id);
      if (!config) return res.status(404).json({ error: "Config not found" });
      res.setHeader("A2A-Version", "1.0");
      res.json({ id: req.params.id, ...config });
    });

    // Delete
    this.app.delete("/push-configs/:id", this.authMiddleware, (req: Request, res: Response) => {
      const existed = this.store.getPushConfig(req.params.id);
      if (existed) this.store.deletePushConfig(req.params.id);
      res.setHeader("A2A-Version", "1.0");
      res.json({ ok: !!existed });
    });
  }

  /**
   * Fire webhook for task completion/failure.
   * Called internally after task state changes.
   */
  private async firePushWebhook(taskId: string, state: string, result?: string): Promise<void> {
    for (const { id, config } of this.store.listPushConfigs()) {
      // If config has taskId filter, only fire for matching tasks
      if (config.taskId && config.taskId !== taskId) continue;
      // SSRF guard — skip invalid URLs at fire time too
      if (!isValidWebhookUrl(config.url, this.allowLocalhost)) {
        console.warn(`[Push] Skipping invalid webhook URL: ${config.url}`);
        continue;
      }
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (config.authentication?.scheme === "bearer" && config.authentication.credentials) {
          headers.Authorization = `Bearer ${config.authentication.credentials}`;
        }
        await fetch(config.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ taskId, state, result, timestamp: new Date().toISOString() }),
        });
        console.log(`[Push] Webhook fired: ${id} → ${config.url} (${state})`);
      } catch (err) {
        console.warn(`[Push] Webhook failed: ${id} → ${config.url}`, (err as Error).message);
      }
    }
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
      if (!task || typeof task !== 'string') throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "task is required and must be a string" };

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

      this.store.setTask(stored);
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

      const task = this.store.getTask(taskId);
      if (!task) return { task: null };
      return { task };
    });

    // tasks/cancelTask — cancel a task
    this.rpc.register("tasks/cancelTask", async (params) => {
      const { taskId } = params as { taskId?: string };
      if (!taskId || typeof taskId !== 'string') throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required and must be a string" };

      return this.withTaskLock(taskId, async () => {
        const task = this.store.getTask(taskId);
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
        this.store.setTask(updated);
        this.broadcast("task:failed", { taskId, error: "Task was cancelled", from: updated.fromAgent, to: updated.toAgent });
        return { task: updated };
      });
    });

    // tasks/resolveTask — post a result (called by completing agent)
    this.rpc.register("tasks/resolveTask", async (params) => {
      const { taskId, state, result, error } = params as {
        taskId?: string;
        state?: TaskState;
        result?: unknown;
        error?: string;
      };
      if (!taskId || typeof taskId !== 'string') throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required and must be a string" };

      return this.withTaskLock(taskId, async () => {
        const task = this.store.getTask(taskId);
        if (!task) return { task: null };

        // State machine validation — reject transitions from terminal states
        const terminalStates = new Set(["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED"]);
        if (terminalStates.has(task.status.state)) {
          throw { code: JSONRPC_CODES.TASK_NOT_CANCELABLE, message: `Task '${taskId}' is already in terminal state: ${task.status.state}` };
        }

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

        this.store.setTask(updated);

        // Broadcast streaming events for task subscription
        this.broadcastToTask(taskId, "task_update", {
          status: updated.status,
          artifacts: updated.artifacts,
        });

        if (finalState === "TASK_STATE_COMPLETED") {
          this.broadcast("task:completed", { taskId: updated.id, result, from: updated.fromAgent, to: updated.toAgent });
          this.broadcastToTask(taskId, "task_completed", { result });
        this.firePushWebhook(taskId, finalState, result);
      } else if (finalState === "TASK_STATE_FAILED") {
        this.broadcast("task:failed", { taskId: updated.id, error, from: updated.fromAgent, to: updated.toAgent });
        this.broadcastToTask(taskId, "task_failed", { error });
        this.firePushWebhook(taskId, finalState, error);
      } else if (finalState === "TASK_STATE_CANCELED") {
        this.broadcast("task:failed", { taskId: updated.id, error: "Task was cancelled", from: updated.fromAgent, to: updated.toAgent });
        this.broadcastToTask(taskId, "task_failed", { error: "Task was cancelled" });
      }

        console.log(`[SharedState] Task ${updated.id.slice(0, 8)} → ${finalState}`);
        return { task: updated };
      });
    });

    // tasks/listTasks — list tasks (optionally filtered by agent)
    this.rpc.register("tasks/listTasks", async (params) => {
      const { agentName } = params as { agentName?: string };
      const all = this.store.listTasks();
      if (agentName) {
        return { tasks: all.filter((t) => t.fromAgent === agentName || t.toAgent === agentName) };
      }
      return { tasks: all };
    });

    // tasks/streamChunk — stream a text chunk for a running task (SSE broadcast)
    this.rpc.register("tasks/streamChunk", async (params) => {
      const { taskId, chunk } = params as { taskId?: string; chunk?: string };
      if (!taskId || typeof taskId !== 'string') throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required and must be a string" };
      if (!chunk) return { ok: true }; // empty chunk, skip

      const task = this.store.getTask(taskId);
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
      if (!taskId || typeof taskId !== 'string') throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "taskId is required and must be a string" };
      if (!message || typeof message !== 'string') throw { code: JSONRPC_CODES.INVALID_PARAMS, message: "message is required and must be a string" };

      return this.withTaskLock(taskId, async () => {
        const task = this.store.getTask(taskId);
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
      this.store.setTask(updated);

      this.broadcastToTask(taskId, "task_update", {
        status: updated.status,
        historyLength: history.length,
      });
      this.broadcast("task:message", { taskId, from: role, message, to: updated.toAgent });

        console.log(`[SharedState] Task ${taskId.slice(0, 8)} +message (${role}): "${message.slice(0, 40)}..."`);
        return { task: updated };
      });
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
        console.error("[SharedState] RPC error:", err);
        res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" }});
      }
    });
  }

  // ── SSE Routes (unchanged — used for event subscription) ────────

  private setupSseRoutes(): void {
    this.app.get("/events", this.authMiddleware, (req: Request, res: Response) => {
      const clientId = (req.query.clientId as string) || crypto.randomUUID();
      const agentId = req.query.agentId as string | undefined;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
      this.sseClients.set(clientId, { res, heartbeat, agentId });

      req.on("close", () => {
        clearInterval(heartbeat);
        this.sseClients.delete(clientId);
      });

      res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);
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
      this.taskStreams.set(clientId, { res, taskId, heartbeat });

      // Send current task state immediately
      const task = this.store.getTask(taskId);
      if (task) {
        res.write(`event: task_update\ndata: ${JSON.stringify({ taskId: task.id, status: task.status })}\n\n`);
      }

      req.on("close", () => {
        clearInterval(heartbeat);
        this.taskStreams.delete(clientId);
      });

      res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

      // Catch-up: if task is already terminal, send final event
      const t2 = this.store.getTask(taskId);
      if (t2) {
        const s = t2.status.state;
        if (s === "TASK_STATE_COMPLETED") {
          res.write(`event: task_completed\ndata: ${JSON.stringify({ taskId, result: t2.artifacts?.[0]?.parts?.[0]?.text })}\n\n`);
        } else if (s === "TASK_STATE_FAILED") {
          res.write(`event: task_failed\ndata: ${JSON.stringify({ taskId, error: t2.metadata?.error })}\n\n`);
        }
      }
    });
  }

  private setupHealthRoutes(): void {
    this.app.get("/health", (_req: Request, res: Response) => {
      const agentNames = this.store.listAgentNames();
      res.json({
        ok: true,
        agents: agentNames.length,
        tasks: this.store.countTasks(),
        agentNames,
      });
    });
  }

  private broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify(data);
    const d = data as Record<string, unknown>;
    for (const [cid, client] of this.sseClients) {
      // Scope task events: only send to relevant agents
      if (event.startsWith("task:") && client.agentId) {
        const isRelevant = d.from === client.agentId || d.to === client.agentId || !d.to;
        if (!isRelevant) continue;
      }
      try {
        client.res.write(`event: ${event}\ndata: ${payload}\n\n`);
      } catch {
        clearInterval(client.heartbeat);
        this.sseClients.delete(cid);
      }
    }
    // taskStreams are per-task — use broadcastToTask instead
  }

  private broadcastToTask(taskId: string, event: string, data: unknown): void {
    const payload = JSON.stringify({ taskId, ...data });
    for (const [cid, entry] of this.taskStreams) {
      if (entry.taskId === taskId) {
        try {
          entry.res.write(`event: ${event}\ndata: ${payload}\n\n`);
        } catch {
          clearInterval(entry.heartbeat);
          this.taskStreams.delete(cid);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────

export class SharedStateClient {
  private baseUrl: string;
  private agentName: string;

  constructor(baseUrl: string, apiKey?: string, agentName?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    if (apiKey) this.apiKey = apiKey;
    this.agentName = agentName ?? "unknown";
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

  // ── Push Notification Config (Google A2A spec §3.1.7-3.1.10) ────

  async createPushConfig(config: PushNotificationConfig): Promise<PushNotificationConfig & { id: string }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const r = await fetch(`${this.baseUrl}/push-configs`, { method: "POST", headers, body: JSON.stringify(config) });
    if (!r.ok) throw new Error(`Create push config failed: ${r.status} ${r.statusText}`);
    return r.json() as Promise<PushNotificationConfig & { id: string }>;
  }

  async listPushConfigs(): Promise<(PushNotificationConfig & { id: string })[]> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const r = await fetch(`${this.baseUrl}/push-configs`, { headers });
    if (!r.ok) throw new Error(`List push configs failed: ${r.status} ${r.statusText}`);
    return r.json() as Promise<(PushNotificationConfig & { id: string })[]>;
  }

  async deletePushConfig(id: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const r = await fetch(`${this.baseUrl}/push-configs/${id}`, { method: "DELETE", headers });
    if (!r.ok) throw new Error(`Delete push config failed: ${r.status} ${r.statusText}`);
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

  subscribe(
    handler: (event: string, data: unknown) => void,
    options?: { onReconnect?: () => Promise<void> },
  ): () => void {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const MAX_BACKOFF = 30_000; // 30s max

    const connect = async () => {
      if (closed) return;
      const controller = new AbortController();

      try {
        const response = await fetch(
          `${this.baseUrl}/events?clientId=${crypto.randomUUID()}&agentId=${encodeURIComponent(this.agentName)}`,
          { headers: this._authHeaders(), signal: controller.signal }
        );
        if (!response.body) return;

        // Connection established — reset backoff
        const wasReconnect = attempt > 0;
        attempt = 0;

        // Notify caller of reconnect (for re-registration)
        if (wasReconnect && options?.onReconnect) {
          // Fire and forget — don't block SSE processing
          options.onReconnect().catch(() => {});
        }

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
        if (closed) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Not an intentional close — reconnect
      }

      // Stream ended or errored — schedule reconnect with exponential backoff
      if (!closed) {
        attempt++;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF);
        const jitter = Math.random() * 500;
        console.warn(
          `[SharedStateClient] SSE disconnected. Reconnecting in ${Math.round((delay + jitter) / 1000)}s (attempt ${attempt})...`
        );
        reconnectTimer = setTimeout(async () => {
          if (closed) return;
          try {
            // Check if server is back before reconnecting
            const reachable = await this.isReachable();
            if (!reachable) {
              console.warn(`[SharedStateClient] Server not reachable, will retry...`);
            }
            // Reconnect SSE regardless — isReachable is best-effort
            await connect();
          } catch {
            // connect() handles its own errors
          }
        }, delay + jitter);
      }
    };

    connect().catch(() => {});

    return () => {
      closed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
  }

  async waitForResult(taskId: string, options?: { timeout?: number }): Promise<StoredTask> {
    const timeout = options?.timeout ?? 120_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
                unsub();
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
