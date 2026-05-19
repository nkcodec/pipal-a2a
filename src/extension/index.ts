/**
 * PiPal-A2A — Pi Extension Entry Point
 * 
 * Each pi terminal IS an agent. Google A2A v1.0 compliant.
 * 
 * This extension:
 *   1. On session_start: HOST or JOIN the shared state
 *   2. Registers ONE tool: pipal_a2a_delegate(task, skill?, to?)
 *   3. Receives delegated tasks via SSE → injects into pi's LLM
 *   4. Captures LLM response → posts result back to shared state
 * 
 * Usage: pi install ./pipal-a2a
 * 
 * Google A2A v1.0 types used:
 *   AgentCard — published to shared state for discovery
 *   Task — represents a unit of work between agents
 *   AgentSkill — declares what this agent can do
 *   AgentInterface — declares protocol endpoint
 *   TaskState — TASK_STATE_SUBMITTED, WORKING, COMPLETED, FAILED
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { resolve } from "path";
import {
  createAgentCard,
  createSkill,
  type AgentCard,
  type AgentSkill,
} from "../core/types.js";
import { SharedStateServer, SharedStateClient, type StoredTask } from "../infrastructure/shared-state.js";
import { InMemoryAgentRegistry } from "../application/registry.js";
import { DefaultTaskRouter } from "../application/router.js";
import { SmartRouter } from "../builtin/smart-router.js";

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

interface ExtensionConfig {
  sharedState: string;
  identity: {
    name: string;
    description?: string;
    skills: string[];
    tags: string[];
  };
  apiKey?: string;
}

function loadConfig(): ExtensionConfig {
  let config: ExtensionConfig = {
    sharedState: "http://localhost:5000",
    identity: {
      name: `agent-${Math.random().toString(36).slice(2, 8)}`,
      skills: [],
      tags: [],
    },
  };

  const paths = [
    resolve(process.cwd(), "config/pipal-a2a.yaml"),
    resolve(process.cwd(), ".pipal-a2a.yaml"),
    resolve(process.env.HOME || "~", ".pi/config/pipal-a2a.yaml"),
  ];

  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      config = load(content) as ExtensionConfig;
      break;
    } catch {
      continue;
    }
  }

  // Environment variables override config file
  if (process.env.PIPAL_NAME) config.identity.name = process.env.PIPAL_NAME;
  if (process.env.PIPAL_SKILLS) {
    config.identity.skills = process.env.PIPAL_SKILLS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.PIPAL_TAGS) {
    config.identity.tags = process.env.PIPAL_TAGS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.PIPAL_DESCRIPTION) config.identity.description = process.env.PIPAL_DESCRIPTION;
  if (process.env.PIPAL_API_KEY) config.apiKey = process.env.PIPAL_API_KEY;
  if (process.env.PIPAL_SHARED_STATE) config.sharedState = process.env.PIPAL_SHARED_STATE;

  return config;
}

// ─────────────────────────────────────────────────────────────────
// Extension Factory
// ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  let client: SharedStateClient | null = null;
  let server: SharedStateServer | null = null;
  let unsubscribe: (() => void) | null = null;
  let card: AgentCard | null = null;

  const registry = new InMemoryAgentRegistry();
  const router = new DefaultTaskRouter(registry);

  // Track delegated tasks for result capture
  let currentDelegatedTaskId: string | null = null;
  let lastAssistantText = "";
  let lastStreamedLength = 0;
  let resultTimer: ReturnType<typeof setTimeout> | null = null;

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_start
  // ───────────────────────────────────────────────────────────────
  pi.on("session_start", async () => {
    const sharedStateUrl = config.sharedState;
    const parsedPort = parseInt(new URL(sharedStateUrl).port || "5000");

    client = new SharedStateClient(sharedStateUrl, config.apiKey);
    const isHost = !(await client.isReachable());

    if (isHost) {
      server = new SharedStateServer();
      await server.start(parsedPort);
      if (config.apiKey) {
        server.addApiKey(config.apiKey);
        console.log(`[pipal-a2a] 🔐 Auth enabled — API key required`);
      }
      console.log(`[pipal-a2a] 🏠 HOST mode — shared state at ${sharedStateUrl}`);
    } else {
      console.log(`[pipal-a2a] 🔗 JOIN mode — connecting to ${sharedStateUrl}`);
    }

    // Build Google A2A v1.0 AgentCard
    const skills: AgentSkill[] = config.identity.skills.map((s) =>
      createSkill(s, s, `Skill: ${s}`, { tags: config.identity.tags })
    );

    card = createAgentCard(
      config.identity.name,
      sharedStateUrl,
      skills,
      { description: config.identity.description || `Agent: ${config.identity.name}` }
    );

    await client.register(card);
    registry.register(card);

    unsubscribe = client.subscribe((event, data) => {
      handleSSEEvent(event, data);
    });

    const skillList = card.skills.length > 0
      ? card.skills.map((s) => s.id).join(", ")
      : "none";
    console.log(`[pipal-a2a] ✅ Online as "${card.name}" [${skillList}]`);
  });

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_shutdown
  // ───────────────────────────────────────────────────────────────
  pi.on("session_shutdown", async () => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (client && card) {
      try { await client.unregister(card.name); } catch {}
    }
    if (server) { await server.stop(); server = null; }
    console.log("[pipal-a2a] Offline");
  });

  // ───────────────────────────────────────────────────────────────
  // Capture LLM responses for delegated tasks
  // Strategy: capture streaming text from message_update,
  // then use agent_end event.messages as the authoritative source.
  // ───────────────────────────────────────────────────────────────
  // Capture LLM responses for delegated tasks
  //
  // Strategy: Quiescence timer.
  // After each message_update with assistant content, start a 15s timer.
  // If no new content arrives within 15s, post the result.
  // Also post on agent_end if it fires (primary path when available).
  //
  // Why not just agent_end?
  //   - sendUserMessage() triggers a spurious agent_end for the idle turn
  //   - The real agent_end may never fire if the turn hangs (auto-commit etc)
  // ───────────────────────────────────────────────────────────────

  async function postDelegatedResult(): Promise<void> {
    if (!currentDelegatedTaskId || !client) return;

    const taskId = currentDelegatedTaskId;
    currentDelegatedTaskId = null;
    if (resultTimer) { clearTimeout(resultTimer); resultTimer = null; }

    const resultText = lastAssistantText || "Task completed";
    lastAssistantText = "";
    lastStreamedLength = 0;
    console.log(`[pipal-a2a] 📤 Posting result for ${taskId.slice(0, 8)} (${resultText.length} chars)`);
    try {
      await client.postResult(taskId, resultText);
      console.log(`[pipal-a2a] ✅ Result posted for ${taskId.slice(0, 8)}`);
    } catch (error) {
      console.error(`[pipal-a2a] ❌ Failed to post result:`, error);
      try { await client.postError(taskId, String(error)); } catch {}
    }
  }

  function resetQuiescenceTimer(): void {
    if (resultTimer) clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      console.log(`[pipal-a2a] ⏱️  Quiescence timer — 15s with no new content, posting result`);
      resultTimer = null;
      postDelegatedResult();
    }, 15_000);
  }

  pi.on("message_update", (event: any) => {
    if (!currentDelegatedTaskId) return;

    try {
      const msg = event?.message;
      let captured = "";

      if (msg?.content) {
        if (typeof msg.content === "string" && msg.content.length > 0) {
          captured = msg.content;
        } else if (Array.isArray(msg.content)) {
          captured = msg.content
            .filter((b: any) => b.type === "text" && b.text)
            .map((b: any) => b.text)
            .join("\n");
        }
      }

      if (!captured && event?.content && typeof event.content === "string") {
        captured = event.content;
      }

      if (captured) {
        lastAssistantText = captured;
        resetQuiescenceTimer();

        // Stream the delta chunk to the planner via SSE
        if (client && currentDelegatedTaskId) {
          const prevLen = lastStreamedLength;
          if (captured.length > prevLen) {
            const chunk = captured.slice(prevLen);
            lastStreamedLength = captured.length;
            client.streamChunk(currentDelegatedTaskId, chunk).catch(() => {});
          }
        }
      }
    } catch {
      // Non-critical
    }
  });

  pi.on("agent_end", async (_event: any) => {
    if (currentDelegatedTaskId && lastAssistantText) {
      console.log(`[pipal-a2a] 📤 Posting result for ${currentDelegatedTaskId.slice(0, 8)} (${lastAssistantText.length} chars)`);
      await postDelegatedResult();
    }
  });

  // ───────────────────────────────────────────────────────────────
  // SSE Event Handler
  // ───────────────────────────────────────────────────────────────
  function handleSSEEvent(event: string, data: any): void {
    switch (event) {
      case "agent:online":
        if (data?.card && data.card.name !== card?.name) {
          registry.register(data.card);
          console.log(`[pipal-a2a] 👋 ${data.card.name} joined the network`);
        }
        break;
      case "agent:offline":
        if (data?.agentId) {
          registry.unregister(data.agentId);
          console.log(`[pipal-a2a] 👋 ${data.agentId} left the network`);
        }
        break;
      case "task:created":
        handleIncomingTask(data);
        break;
      case "task:completed":
        console.log(`[pipal-a2a] ✅ Task ${data?.taskId?.slice(0, 8)} completed`);
        break;
      case "task:failed":
        console.log(`[pipal-a2a] ❌ Task ${data?.taskId?.slice(0, 8)} failed: ${data?.error}`);
        break;
      case "task:message":
        // Multi-turn: message appended to task history
        break;
    }
  }

  async function handleIncomingTask(data: any): Promise<void> {
    if (!card || !client) return;

    // SSE task:created event: { taskId, from, to, skill, task }
    const taskId = data?.taskId;
    const from = data?.from || "unknown";
    const to = data?.to;
    const skill = data?.skill;
    const description = data?.task || "";

    if (!taskId) {
      console.error(`[pipal-a2a] ❌ handleIncomingTask: no taskId in data:`, JSON.stringify(data).slice(0, 200));
      return;
    }

    const isDirect = to === card.name;
    const isSkillMatch = !to && skill && card.skills.some((s) => s.id === skill);
    if (!isDirect && !isSkillMatch) return;
    if (from === card?.name) return;
    if (currentDelegatedTaskId) {
      await client.postError(taskId, "Agent busy with another task");
      return;
    }

    console.log(`[pipal-a2a] 📩 Delegated task from ${from}: "${String(description).slice(0, 60)}..."`);
    currentDelegatedTaskId = taskId;
    lastAssistantText = "";
    lastStreamedLength = 0;

    const taskMessage =
      `[Delegated task from ${from}]:\n\n${description}\n\n` +
      `Please complete this task using your tools. Your response will be sent back to ${from}.`;

    try {
      pi.sendUserMessage(taskMessage);
    } catch (error) {
      console.error(`[pipal-a2a] ❌ sendUserMessage FAILED:`, error);
      await client.postError(taskId, `Failed to inject task: ${error}`);
      currentDelegatedTaskId = null;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_delegate
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_delegate",
    label: "Delegate to Agent (A2A)",
    description:
      "Send a task to another agent terminal in the P2P agent network. " +
      "IMPORTANT: This is the ONLY way to delegate work to other pi terminals. " +
      "Use this tool instead of subagents when you want to send work to another terminal. " +
      "The other agent's LLM will process the task in its own terminal (the user can see it working). " +
      "Waits up to 2 minutes for the result.",
    promptSnippet: "Delegate work to other pi terminals via P2P A2A network",
    promptGuidelines: [
      "IMPORTANT: Always use pipal_a2a_delegate (not subagents) when delegating to another agent terminal.",
      "Use pipal_a2a_delegate when the user wants to send work to another terminal/agent.",
      "Specify skill to route to the right agent: planning, code-generation, security-review, frontend-implementation, backend-implementation.",
      "Specify to to send directly to a named agent (e.g. to='backend').",
      "You can call pipal_a2a_delegate multiple times for parallel work across terminals.",
    ],
    parameters: Type.Object({
      task: Type.String({ description: "The task description to delegate" }),
      skill: Type.Optional(Type.String({ description: "Required skill ID for routing" })),
      to: Type.Optional(Type.String({ description: "Specific agent ID (bypasses routing)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!client || !card) {
        return {
          content: [{ type: "text" as const, text: "Error: Agent network not started." }],
          details: { error: "not_started" },
        };
      }

      try {
        // Route using shared state (not local registry — SSE may miss events)
        const onlineAgents = await client.listAgents();
        const others = onlineAgents.filter((a: AgentCard) => a.name !== card!.name);

        let targetCard: AgentCard | undefined;

        // Direct routing — target agent specified by name
        if (params.to) {
          targetCard = others.find((a: AgentCard) => a.name === params.to);
          if (!targetCard) {
            return {
              content: [{
                type: "text" as const,
                text: `Agent "${params.to}" not found. Online: ${others.map((a: AgentCard) => a.name).join(", ") || "none"}`,
              }],
              details: { error: "not_found" },
            };
          }
        }

        // Skill-based routing
        if (!targetCard && params.skill) {
          const matches = others.filter((a: AgentCard) =>
            a.skills.some((s) => s.id === params.skill)
          );
          if (matches.length > 0) targetCard = matches[0];
        }

      // Auto-route: no explicit to or skill → use SmartRouter
      if (!targetCard && !params.to && !params.skill) {
        const smart = new SmartRouter();
        const task = {
          id: "preview",
          status: { state: "TASK_STATE_SUBMITTED" as any, timestamp: new Date().toISOString() },
          history: [{
            messageId: "preview",
            role: "ROLE_USER" as any,
            parts: [{ text: params.task }],
          }],
          metadata: {},
        };
        targetCard = smart.select(task, others);
        if (targetCard) {
          console.log(`[pipal-a2a] 🎯 Auto-routed to ${targetCard.name} (SmartRouter)`);
        }
      }

        // Fallback — pick first available other agent
        if (!targetCard && others.length > 0) {
          targetCard = others[0];
        }

        if (!targetCard) {
          return {
            content: [{
              type: "text" as const,
              text: `No other agent available. Online: ${onlineAgents.map((a: AgentCard) => a.name).join(", ") || "none"}`,
            }],
            details: { error: "no_agent" },
          };
        }

        console.log(`[pipal-a2a] 🎯 Routing to ${targetCard.name} (online: ${onlineAgents.map((a: AgentCard) => a.name).join(", ")})`);

        // Submit task to shared state
        const taskId = await client.createTask({
          from: card.name,
          to: targetCard.name,
          skill: params.skill,
          task: params.task,
        });

        console.log(`[pipal-a2a] 📤 Task ${taskId.slice(0, 8)} → ${targetCard.name}: "${params.task.slice(0, 50)}..."`);

        // Stream results via SSE — show each chunk via onUpdate as it arrives
        const result = await new Promise<StoredTask>((resolve, reject) => {
          let accumulated = "";
          const timer = setTimeout(
            () => reject(new Error(`Task ${taskId} timed out after 120s`)),
            120_000,
          );

          const unsub = client.subscribeToTask(taskId, (event, data) => {
            if (event === "artifact_update" && (data as any).chunk) {
              accumulated += (data as any).chunk;
              // Stream each chunk to the planner's TUI
              if (onUpdate) {
                onUpdate({
                  content: [{
                    type: "text" as const,
                    text: `**Streaming from ${targetCard.name}:**\n${accumulated}▍`,
                  }],
                  details: { taskId, from: card.name, to: targetCard.name, streaming: true },
                });
              }
            }
            // Multi-turn: backend asks a follow-up question
            if (event === "task_update") {
              const status = (data as any)?.status;
              if (status?.state === "TASK_STATE_INPUT_REQUIRED") {
                // Fire async — can't await in sync SSE callback
                (async () => {
                  try {
                    const taskNow = await client.getTask(taskId);
                    const lastAgentMsg = [...(taskNow.history || [])]
                      .reverse()
                      .find((m) => m.role === "ROLE_AGENT");
                    const question = lastAgentMsg?.parts?.[0]?.text ?? "The agent needs more information.";
                    accumulated += `\n\n❓ **${targetCard.name} asks:** ${question}\n*Responding automatically with task context...*\n`;
                    if (onUpdate) {
                      onUpdate({
                        content: [{ type: "text" as const, text: accumulated }],
                        details: { taskId, from: card.name, to: targetCard.name, inputRequired: true },
                      });
                    }
                    await client.sendFollowUp(taskId, `Continue with the task. Original request: ${params.task}`, { role: "ROLE_USER" });
                  } catch (err) {
                    console.error("[pipal-a2a] multi-turn error:", err);
                  }
                })();
              }
            }
            if (event === "task_completed" || event === "task_failed") {
              clearTimeout(timer);
              unsub();
              client.getTask(taskId).then(resolve).catch(reject);
            }
          });
        });

        if (result.status.state === "TASK_STATE_COMPLETED") {
          const resultText = result.artifacts?.[0]?.parts?.[0]?.text
            ?? JSON.stringify(result.artifacts, null, 2);
          return {
            content: [{
              type: "text" as const,
              text: `**Result from ${targetCard.name}:**\n\n${resultText}`,
            }],
            details: {
              taskId,
              from: card.name,
              to: targetCard.name,
              state: result.status.state,
              durationMs: result.artifacts?.[0]
                ? new Date(result.status.timestamp).getTime() - (result.metadata?.createdAt as number || 0)
                : 0,
            },
          };
        } else {
          return {
            content: [{
              type: "text" as const,
              text: `Task failed on ${targetCard.name}: ${result.metadata?.error || "Unknown error"}`,
            }],
            details: { taskId, error: result.metadata?.error },
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Delegation error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: { error: String(error) },
        };
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Command: /pipal-status
  // ───────────────────────────────────────────────────────────────
  pi.registerCommand("pipal-status", {
    description: "Show P2P agent network status (Google A2A)",
    handler: async (_args, ctx) => {
      if (!client) {
        ctx.ui.notify("Agent network not started", "warning");
        return;
      }
      try {
        const agents = await client.listAgents();
        if (agents.length === 0) {
          ctx.ui.notify("No agents online", "warning");
          return;
        }
        const lines = agents
          .map((a) => {
            const isYou = a.name === card?.name;
            const skills = a.skills.map((s) => s.id).join(", ") || "none";
            const iface = a.supportedInterfaces[0];
            return `  ${isYou ? "→ " : "  "}${a.name}: [${skills}]${isYou ? " (you)" : ""} ${iface?.protocolBinding || ""}`;
          })
          .join("\n");
        ctx.ui.notify(`${agents.length} agent(s) online (A2A v1.0):\n${lines}`, "info");
      } catch (error) {
        ctx.ui.notify(`Failed to get status: ${error}`, "error");
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_ask (multi-turn follow-up)
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_ask",
    label: "Ask Follow-Up Question (A2A)",
    description:
      "Ask a follow-up question on a delegated task when you need clarification. " +
      "Use ONLY when you are processing a task from another agent and need more information. " +
      "The question will be sent back to the delegating agent.",
    promptSnippet: "Ask follow-up question on delegated task",
    promptGuidelines: [
      "Use pipal_a2a_ask when processing a delegated task and you need clarification.",
      "The question goes back to the agent that sent you the task.",
      "After asking, wait — the delegating agent will respond with more information.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The follow-up question to ask the delegating agent" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!client || !currentDelegatedTaskId) {
        return {
          content: [{ type: "text" as const, text: "Error: No active delegated task to ask about." }],
          details: { error: "no_task" },
        };
      }

      try {
        const task = await client.sendFollowUp(currentDelegatedTaskId, params.question, {
          role: "ROLE_AGENT",
          requireInput: true,
        });
        console.log(`[pipal-a2a] ❓ Asked follow-up on ${currentDelegatedTaskId.slice(0, 8)}: "${params.question.slice(0, 40)}..."`);
        return {
          content: [{
            type: "text" as const,
            text: `Question sent to delegating agent. Waiting for response...`,
          }],
          details: { taskId: currentDelegatedTaskId, asked: true },
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to ask follow-up: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });
}
