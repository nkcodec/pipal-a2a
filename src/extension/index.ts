/**
 * PiPal-A2A — Pi Extension Entry Point
 * 
 * Each pi terminal IS an agent. This extension:
 *   1. On session_start: HOST or JOIN the shared state
 *   2. Registers ONE tool: pipal_a2a_delegate(task, skill?, to?)
 *   3. Receives delegated tasks via SSE → injects into pi's LLM
 *   4. Captures LLM response → posts result back to shared state
 * 
 * Usage: pi install ./pipal-a2a
 * 
 * Real-time flow:
 *   Terminal A: LLM calls pipal_a2a_delegate() → task sent to shared state
 *   Terminal B: SSE → task arrives → pi.sendUserMessage() → LLM works (you see it!)
 *   Terminal B: LLM finishes → result posted to shared state
 *   Terminal A: Tool receives result → LLM continues
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { resolve } from "path";
import { createAgentCard, type AgentCard, type A2AMessage } from "../core/types.js";
import { SharedStateServer, SharedStateClient } from "../infrastructure/shared-state.js";
import { InMemoryAgentRegistry } from "../application/registry.js";
import { DefaultTaskRouter } from "../application/router.js";

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

interface ExtensionConfig {
  sharedState: string;
  identity: {
    name: string;
    description?: string;
    skills: string[];
  };
}

function loadConfig(): ExtensionConfig {
  const paths = [
    resolve(process.cwd(), "config/pipal-a2a.yaml"),
    resolve(process.cwd(), ".pipal-a2a.yaml"),
    resolve(process.env.HOME || "~", ".pi/config/pipal-a2a.yaml"),
  ];

  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      return load(content) as ExtensionConfig;
    } catch {
      continue;
    }
  }

  // Default: auto-generated name, no skills, localhost:5000
  return {
    sharedState: "http://localhost:5000",
    identity: {
      name: `agent-${Math.random().toString(36).slice(2, 8)}`,
      skills: [],
    },
  };
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

  // Local registry — mirrors shared state (populated via SSE)
  const registry = new InMemoryAgentRegistry();
  const router = new DefaultTaskRouter(registry);

  // Task tracking: when this terminal receives a delegated task,
  // we track it so we can capture the LLM response and post it back.
  let currentDelegatedTaskId: string | null = null;
  let lastAssistantText = "";

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_start → HOST or JOIN
  // ───────────────────────────────────────────────────────────────
  pi.on("session_start", async () => {
    const sharedStateUrl = config.sharedState;
    const parsedPort = parseInt(new URL(sharedStateUrl).port || "5000");

    client = new SharedStateClient(sharedStateUrl);

    // Auto-detect: HOST if no shared state running, JOIN if found
    const isHost = !(await client.isReachable());

    if (isHost) {
      server = new SharedStateServer();
      await server.start(parsedPort);
      console.log(`[pipal-a2a] 🏠 HOST mode — shared state at ${sharedStateUrl}`);
    } else {
      console.log(`[pipal-a2a] 🔗 JOIN mode — connecting to ${sharedStateUrl}`);
    }

    // Build this terminal's AgentCard
    card = createAgentCard(
      config.identity.name,
      sharedStateUrl,
      config.identity.skills.map((s) => ({
        id: s,
        name: s,
        description: `Skill: ${s}`,
      })),
      { description: config.identity.description || `Agent: ${config.identity.name}` }
    );

    // Register in shared state
    await client.register(card);
    registry.register(card);

    // Subscribe to SSE events
    unsubscribe = client.subscribe((event, data) => {
      handleSSEEvent(event, data);
    });

    const skillList = card.skills.length > 0
      ? card.skills.map((s) => s.id).join(", ")
      : "none";
    console.log(`[pipal-a2a] ✅ Online as "${card.name}" with skills: [${skillList}]`);
  });

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_shutdown → leave network
  // ───────────────────────────────────────────────────────────────
  pi.on("session_shutdown", async () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (client && card) {
      try {
        await client.unregister(card.name);
      } catch {
        // shared state may already be down
      }
    }
    if (server) {
      await server.stop();
      server = null;
    }
    console.log("[pipal-a2a] Offline");
  });

  // ───────────────────────────────────────────────────────────────
  // Capture LLM responses for delegated tasks
  // ───────────────────────────────────────────────────────────────

  // Track the last assistant message text
  pi.on("message_update", (event: any) => {
    if (event?.content) {
      lastAssistantText =
        typeof event.content === "string"
          ? event.content
          : JSON.stringify(event.content);
    }
  });

  // When agent finishes and we're processing a delegated task, post result
  pi.on("agent_end", async () => {
    if (currentDelegatedTaskId && client) {
      const taskId = currentDelegatedTaskId;
      const resultText = lastAssistantText || "Task completed";
      currentDelegatedTaskId = null;
      lastAssistantText = "";

      try {
        await client.postResult(taskId, resultText);
        console.log(`[pipal-a2a] 📤 Result posted for task ${taskId.slice(0, 8)}`);
      } catch (error) {
        console.error(`[pipal-a2a] Failed to post result:`, error);
        try {
          await client.postError(taskId, String(error));
        } catch {
          // give up
        }
      }
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
    }
  }

  async function handleIncomingTask(task: any): Promise<void> {
    if (!card || !client) return;

    // Is this task for us?
    const isDirect = task.to === card.name;
    const isSkillMatch =
      !task.to &&
      task.skill &&
      card.skills.some((s) => s.id === task.skill);
    const isForMe = isDirect || isSkillMatch;

    if (!isForMe) return;

    // Don't process our own tasks
    if (task.from === card.name) return;

    // Already processing something? Queue is v2
    if (currentDelegatedTaskId) {
      console.log(`[pipal-a2a] ⏳ Busy, rejecting task from ${task.from}`);
      await client.postError(task.id, "Agent busy with another task");
      return;
    }

    console.log(
      `[pipal-a2a] 📩 Delegated task from ${task.from}: "${task.task.slice(0, 60)}..."`
    );

    // Mark as current delegated task
    currentDelegatedTaskId = task.id;
    lastAssistantText = "";

    // Inject into pi's conversation — the user will see the LLM work in real-time!
    const taskMessage =
      `[Delegated task from ${task.from}]:\n\n${task.task}\n\n` +
      `Please complete this task using your tools. Your response will be sent back to ${task.from}.`;

    try {
      pi.sendUserMessage(taskMessage);
    } catch (error) {
      await client.postError(task.id, `Failed to inject task: ${error}`);
      currentDelegatedTaskId = null;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_delegate
  // ───────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "pipal_a2a_delegate",
    label: "Delegate to Agent",
    description:
      "Send a task to another agent in the P2P network. " +
      "Routes to the best agent based on skills. " +
      "Waits for the result (up to 2 minutes). " +
      "The other agent's LLM will process the task in its own terminal — the user can see it working in real-time.",
    promptSnippet: "Delegate subtasks to specialized agents for parallel execution",
    promptGuidelines: [
      "Use pipal_a2a_delegate when a task benefits from a specialized agent.",
      "Specify skill to route to the right agent: planning, code-generation, security-review, frontend-implementation, backend-implementation.",
      "Specify to to send directly to a named agent (bypasses skill routing).",
      "You can call this tool multiple times for parallel work across agents.",
      "The tool waits for the other agent to complete and returns its result.",
    ],
    parameters: Type.Object({
      task: Type.String({
        description: "The task description to delegate to the other agent",
      }),
      skill: Type.Optional(
        Type.String({
          description:
            "Required skill ID for routing. Options: planning, delegation, code-generation, backend-implementation, frontend-implementation, security-review, code-review",
        })
      ),
      to: Type.Optional(
        Type.String({
          description: "Specific agent ID to send to (bypasses skill routing)",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!client || !card) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Agent network not started. Try /pipal-status to check.",
            },
          ],
          details: { error: "not_started" },
        };
      }

      try {
        // Route to target agent
        const syntheticMessage: A2AMessage = {
          id: "",
          from: card.name,
          to: params.to || "*",
          action: "execute",
          payload: params.task,
          skill: params.skill,
          timestamp: Date.now(),
        };

        const targetCard = await router.route(syntheticMessage);

        if (!targetCard) {
          const onlineAgents = await client.listAgents();
          const agentList =
            onlineAgents.length > 0
              ? onlineAgents
                  .map((a) => `${a.name} [${a.skills.map((s) => s.id).join(", ")}]`)
                  .join(", ")
              : "none";
          return {
            content: [
              {
                type: "text" as const,
                text: `No agent available${
                  params.skill ? ` with skill "${params.skill}"` : ""
                }.\nOnline agents: ${agentList}`,
              },
            ],
            details: { error: "no_agent" },
          };
        }

        // Don't delegate to self
        if (targetCard.name === card.name) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Cannot delegate to yourself. Other agents in the network: " +
                  (await client.listAgents())
                    .filter((a) => a.name !== card!.name)
                    .map((a) => a.name)
                    .join(", ") || "none",
              },
            ],
            details: { error: "self_delegate" },
          };
        }

        // Create task in shared state
        const taskId = await client.createTask({
          from: card.name,
          to: targetCard.name,
          skill: params.skill,
          task: params.task,
        });

        console.log(
          `[pipal-a2a] 📤 Task ${taskId.slice(0, 8)} delegated to ${targetCard.name}: "${params.task.slice(0, 50)}..."`
        );

        // Wait for the other agent to process and return result
        const result = await client.waitForResult(taskId, {
          timeout: 120_000,
        });

        if (result.status === "completed") {
          const resultText =
            typeof result.result === "string"
              ? result.result
              : JSON.stringify(result.result, null, 2);

          return {
            content: [
              {
                type: "text" as const,
                text: `**Result from ${targetCard.name}:**\n\n${resultText}`,
              },
            ],
            details: {
              taskId,
              from: card.name,
              to: targetCard.name,
              durationMs: result.completedAt
                ? result.completedAt - result.createdAt
                : 0,
            },
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `Task failed on ${targetCard.name}: ${result.error || "Unknown error"}`,
              },
            ],
            details: { taskId, error: result.error },
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Delegation error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { error: String(error) },
        };
      }
    },
  });

  // ───────────────────────────────────────────────────────────────
  // Command: /pipal-status
  // ───────────────────────────────────────────────────────────────

  pi.registerCommand("pipal-status", {
    description: "Show P2P agent network status — who's online, what skills they have",
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
            return `  ${isYou ? "→ " : "  "}${a.name}: [${skills}]${isYou ? " (you)" : ""}`;
          })
          .join("\n");

        ctx.ui.notify(`${agents.length} agent(s) online:\n${lines}`, "info");
      } catch (error) {
        ctx.ui.notify(`Failed to get status: ${error}`, "error");
      }
    },
  });
}
