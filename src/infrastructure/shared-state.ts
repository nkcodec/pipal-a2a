/**
 * PiPal-A2A Infrastructure — Shared State Server + Client
 * 
 * The rendezvous point for the P2P agent network.
 * Uses Google A2A v1.0 Task/AgentCard data model.
 * 
 * HOST mode: first pi terminal starts this server
 * JOIN mode: subsequent terminals connect as clients
 */

import express, { type Request, type Response } from "express";
import type { AgentCard, Task, TaskState } from "../core/types.js";
import { createTask } from "../core/types.js";

// ─────────────────────────────────────────────────────────────────
// Stored Task (extends Google A2A Task with routing metadata)
// ─────────────────────────────────────────────────────────────────

export interface StoredTask extends Task {
  /** Which agent submitted this task */
  readonly fromAgent: string;
  /** Target agent name (null = route by skill) */
  readonly toAgent: string | null;
  /** Skill hint for routing */
  readonly skillHint: string | null;
  /** The task description sent by the delegating agent */
  readonly taskDescription: string;
}

// ─────────────────────────────────────────────────────────────────
// Server (HOST mode)
// ─────────────────────────────────────────────────────────────────

export class SharedStateServer {
  private app = express();
  private server: ReturnType<typeof this.app.listen> | null = null;
  private agents = new Map<string, AgentCard>();
  private tasks = new Map<string, StoredTask>();
  private sseClients = new Map<string, Response>();

  async start(port: number): Promise<string> {
    this.app.use(express.json());
    this.setupRoutes();

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        const url = `http://localhost:${port}`;
        console.log(`[SharedState] Rendezvous server at ${url}`);
        resolve(url);
      });
      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    for (const res of this.sseClients.values()) res.end();
    this.sseClients.clear();
    return new Promise((resolve, reject) => {
      this.server?.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private setupRoutes(): void {
    // ── Agent Card Discovery (Google A2A: /.well-known/agent-card.json) ──

    // Individual agent cards
    this.app.get("/agents/:name", (req: Request, res: Response) => {
      const card = this.agents.get(req.params.name);
      if (!card) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      res.json(card);
    });

    // List all agents
    this.app.get("/agents", (_req: Request, res: Response) => {
      res.json(Array.from(this.agents.values()));
    });

    // ── Agent Registration (P2P extension, not in Google A2A spec) ──

    this.app.post("/register", (req: Request, res: Response) => {
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

    this.app.post("/unregister", (req: Request, res: Response) => {
      const { agentId } = req.body;
      if (agentId) {
        this.agents.delete(agentId);
        this.broadcast("agent:offline", { agentId });
        console.log(`[SharedState] Agent left: ${agentId}`);
      }
      res.json({ ok: true });
    });

    // ── Task Management (Google A2A: SendMessage creates Tasks) ──

    this.app.post("/tasks", (req: Request, res: Response) => {
      const { from, to, skill, task } = req.body;
      if (!from || !task) {
        res.status(400).json({ error: "Task requires 'from' and 'task'" });
        return;
      }

      const stored: StoredTask = {
        ...createTask(crypto.randomUUID(), "TASK_STATE_SUBMITTED"),
        fromAgent: from,
        toAgent: to || null,
        skillHint: skill || null,
        taskDescription: task,
      };

      this.tasks.set(stored.id, stored);
      this.broadcast("task:created", {
        taskId: stored.id,
        from,
        to: stored.toAgent,
        skill: stored.skillHint,
        task,
      });
      console.log(
        `[SharedState] Task ${stored.id.slice(0, 8)}: ${from} → ${to || "any"} "${task.slice(0, 40)}..."`
      );
      res.json({ taskId: stored.id });
    });

    this.app.get("/tasks/:id", (req: Request, res: Response) => {
      const task = this.tasks.get(req.params.id);
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      res.json(task);
    });

    this.app.post("/tasks/:id/result", (req: Request, res: Response) => {
      const task = this.tasks.get(req.params.id);
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      const { state, result, error } = req.body as {
        state?: TaskState;
        result?: unknown;
        error?: string;
      };

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
          error: error,
        },
      };

      this.tasks.set(req.params.id, updated);

      if (finalState === "TASK_STATE_COMPLETED") {
        this.broadcast("task:completed", { taskId: updated.id, result });
      } else if (finalState === "TASK_STATE_FAILED") {
        this.broadcast("task:failed", { taskId: updated.id, error });
      }

      console.log(`[SharedState] Task ${updated.id.slice(0, 8)} → ${finalState}`);
      res.json({ ok: true });
    });

    // ── SSE Events ──

    this.app.get("/events", (req: Request, res: Response) => {
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

    // ── Health ──

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
  }
}

// ─────────────────────────────────────────────────────────────────
// Client (used by every terminal)
// ─────────────────────────────────────────────────────────────────

export class SharedStateClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

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
    const r = await fetch(`${this.baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!r.ok) throw new Error(`Register failed: ${r.statusText}`);
  }

  async unregister(agentId: string): Promise<void> {
    await fetch(`${this.baseUrl}/unregister`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
  }

  async listAgents(): Promise<AgentCard[]> {
    const r = await fetch(`${this.baseUrl}/agents`);
    if (!r.ok) throw new Error(`List agents failed: ${r.statusText}`);
    return r.json() as Promise<AgentCard[]>;
  }

  async createTask(params: {
    from: string;
    to?: string;
    skill?: string;
    task: string;
  }): Promise<string> {
    const r = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error(`Create task failed: ${r.statusText}`);
    const { taskId } = (await r.json()) as { taskId: string };
    return taskId;
  }

  async getTask(taskId: string): Promise<StoredTask> {
    const r = await fetch(`${this.baseUrl}/tasks/${taskId}`);
    if (!r.ok) throw new Error(`Get task failed: ${r.statusText}`);
    return r.json() as Promise<StoredTask>;
  }

  async postResult(taskId: string, result: unknown): Promise<void> {
    const r = await fetch(`${this.baseUrl}/tasks/${taskId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "TASK_STATE_COMPLETED", result }),
    });
    if (!r.ok) throw new Error(`Post result failed: ${r.statusText}`);
  }

  async postError(taskId: string, error: string): Promise<void> {
    const r = await fetch(`${this.baseUrl}/tasks/${taskId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "TASK_STATE_FAILED", error }),
    });
    if (!r.ok) throw new Error(`Post error failed: ${r.statusText}`);
  }

  subscribe(handler: (event: string, data: unknown) => void): () => void {
    const controller = new AbortController();
    let closed = false;

    const connect = async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/events?clientId=${crypto.randomUUID()}`,
          { signal: controller.signal }
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
        if (!closed) {
          console.error("[SharedStateClient] SSE connection lost:", error);
        }
      }
    };

    connect();
    return () => {
      closed = true;
      controller.abort();
    };
  }

  async waitForResult(
    taskId: string,
    options?: { timeout?: number }
  ): Promise<StoredTask> {
    const timeout = options?.timeout ?? 120_000;
    const interval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const task = await this.getTask(taskId);
      if (
        task.status.state === "TASK_STATE_COMPLETED" ||
        task.status.state === "TASK_STATE_FAILED"
      ) {
        return task;
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
  }
}
