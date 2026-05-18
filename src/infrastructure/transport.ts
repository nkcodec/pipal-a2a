/**
 * PiPal-A2A Infrastructure — A2A Transport Layer
 * 
 * karpathy-clean-code: Infrastructure layer.
 * Implements SDK interfaces: Transport, AgentRuntime.
 * Imports Core (types) and SDK (interfaces) only.
 */

import express, { type Request, type Response } from "express";
import { EventEmitter } from "events";
import type { 
  A2AMessage, 
  AgentCard, 
  Transport, 
  AgentRuntime,
  MessageBus 
} from "../sdk/index.js";
import { createMessage, createTaskResult } from "../core/types.js";

/**
 * SSE Transport — HTTP + Server-Sent Events
 * 
 * Each agent runs as HTTP server.
 * Agents exchange messages via POST /tasks.
 * Events stream via GET /events.
 */
export class A2ATransport implements Transport {
  private app = express();
  private server: ReturnType<typeof this.app.listen> | null = null;
  private messageHandlers: ((message: A2AMessage) => void)[] = [];
  private connectHandlers: ((agentId: string) => void)[] = [];
  private disconnectHandlers: ((agentId: string) => void)[] = [];
  
  // Keep-alive for SSE clients
  private clients = new Map<string, Response>();
  
  async listen(port: number): Promise<void> {
    this.app.use(express.json());
    
    // Agent card endpoint
    this.app.get("/agent-card", (_req: Request, res: Response) => {
      res.json(this.agentCard);
    });
    
    // Task submission endpoint
    this.app.post("/tasks", async (req: Request, res: Response) => {
      try {
        const message = req.body as A2AMessage;
        
        // Validate message structure
        if (!message.from || !message.to || !message.action) {
          res.status(400).json({ error: "Invalid message structure" });
          return;
        }
        
        // Notify handlers
        for (const handler of this.messageHandlers) {
          handler(message);
        }
        
        // Respond with 202 Accepted (async processing)
        res.status(202).json({ 
          taskId: message.id, 
          status: "accepted" 
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
    
    // SSE events endpoint
    this.app.get("/events", (req: Request, res: Response) => {
      const agentId = req.query.agentId as string || "unknown";
      
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      
      // Send heartbeat every 15s
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 15000);
      
      // Store client for broadcasting
      this.clients.set(agentId, res);
      this.connectHandlers.forEach(h => h(agentId));
      
      // Cleanup on disconnect
      req.on("close", () => {
        clearInterval(heartbeat);
        this.clients.delete(agentId);
        this.disconnectHandlers.forEach(h => h(agentId));
      });
      
      res.write("event: connected\ndata: {}\n\n");
    });
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        console.log(`[A2ATransport] Listening on port ${port}`);
        resolve();
      });
      this.server.on("error", reject);
    });
  }
  
  async close(): Promise<void> {
    // Close all SSE clients
    for (const res of this.clients.values()) {
      res.end();
    }
    this.clients.clear();
    
    return new Promise((resolve, reject) => {
      this.server?.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async send(message: A2AMessage): Promise<void> {
    // Broadcast to all connected clients (for now, simple broadcast)
    for (const res of this.clients.values()) {
      res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
    }
  }
  
  onMessage(handler: (message: A2AMessage) => void): void {
    this.messageHandlers.push(handler);
  }
  
  onConnect(handler: (agentId: string) => void): void {
    this.connectHandlers.push(handler);
  }
  
  onDisconnect(handler: (agentId: string) => void): void {
    this.disconnectHandlers.push(handler);
  }
  
  /** Broadcast event to all SSE clients */
  broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify(data);
    for (const res of this.clients.values()) {
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    }
  }
  
  constructor(private agentCard: AgentCard) {}
}

/**
 * HTTP Client — sends messages to peer agents
 */
export class A2AClient {
  private baseUrl: string;
  
  constructor(endpoint: string) {
    // Normalize endpoint (remove trailing slash)
    this.baseUrl = endpoint.replace(/\/$/, "");
  }
  
  async send(message: A2AMessage): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
    }
  }
  
  async fetchAgentCard(): Promise<AgentCard> {
    const response = await fetch(`${this.baseUrl}/agent-card`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.status}`);
    }
    
    return response.json() as Promise<AgentCard>;
  }
}

/**
 * Simple Message Bus — EventEmitter-based pub/sub
 * 
 * Used for local events (no network).
 * Dashboard subscribes to this for SSE updates.
 */
export class LocalMessageBus implements MessageBus {
  private emitter = new EventEmitter();
  
  publish(channel: string, data: unknown): void {
    this.emitter.emit(channel, data);
  }
  
  subscribe(channel: string, handler: (data: unknown) => void): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }
}