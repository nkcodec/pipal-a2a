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
  createTask,
  createSkill,
  type AgentCard,
  type Task,
  type AgentSkill,
} from "../core/types.js";
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
  let config: ExtensionConfig = {
    sharedState: "http://localhost:5000",
    identity: {
      name: `agent-${Math.random().toString(36).slice(2, 8)}`,
      skills: [],
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
  if (process.env.PIPAL_DESCRIPTION) config.identity.description = process.env.PIPAL_DESCRIPTION;
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
  let resultTimer: ReturnType<typeof setTimeout> | null = null;

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: session_start
  // ───────────────────────────────────────────────────────────────
  pi.on("session_start", async () => {
    const sharedStateUrl = config.sharedState;
    const parsedPort = parseInt(new URL(sharedStateUrl).port || "5000");

    client = new SharedStateClient(sharedStateUrl);
    const isHost = !(await client.isReachable());

    if (isHost) {
      server = new SharedStateServer();
      await server.start(parsedPort);
      console.log(`[pipal-a2a] 🏠 HOST mode — shared state at ${sharedStateUrl}`);
    } else {
      console.log(`[pipal-a2a] 🔗 JOIN mode — connecting to ${sharedStateUrl}`);
    }

    // Build Google A2A v1.0 AgentCard
    const skills: AgentSkill[] = config.identity.skills.map((s) =>
      createSkill(s, s, `Skill: ${s}`)
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
    try {
      const msg = event?.message;
      if (msg?.role !== "assistant" || !currentDelegatedTaskId) return;

      const content = msg.content;
      let captured = "";

      if (typeof content === "string" && content.length > 0) {
        captured = content;
      } else if (Array.isArray(content)) {
        captured = content
          .filter((b: any) => b.type === "text" && b.text)
          .map((b: any) => b.text)
          .join("\n");
      }

      if (captured) {
        lastAssistantText = captured;
        console.log(`[pipal-a2a] 🔵 captured: ${captured.length} chars`);
        resetQuiescenceTimer();
      }
    } catch (e) {
      console.error(`[pipal-a2a] message_update error:`, e);
    }
  });

  pi.on("agent_end", async (_event: any) => {
    console.log(
      `[pipal-a2a] 🟢 agent_end. task=${currentDelegatedTaskId?.slice(0, 8) ?? "none"}, ` +
      `streaming=${lastAssistantText.length} chars`
    );
    // Post immediately if we have content — agent_end is the cleanest signal
    if (currentDelegatedTaskId && lastAssistantText) {
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
    }
  }

  async function handleIncomingTask(task: any): Promise<void> {
    if (!card || !client) return;

    const isDirect = task.to === card.name;
    const isSkillMatch = !task.to && task.skill && card.skills.some((s) => s.id === task.skill);
    if (!isDirect && !isSkillMatch) return;
    if (task.from === card?.name) return;
    if (currentDelegatedTaskId) {
      await client.postError(task.id, "Agent busy with another task");
      return;
    }

    console.log(`[pipal-a2a] 📩 Delegated task from ${task.from}: "${task.task.slice(0, 60)}..."`);
    currentDelegatedTaskId = task.id;
    lastAssistantText = "";

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
        // Create a Google A2A Task for routing decisions
        const routingTask = createTask(crypto.randomUUID(), "TASK_STATE_SUBMITTED", {
          metadata: { skill: params.skill, to: params.to },
        });

        const targetCard = await router.route(routingTask);

        if (!targetCard) {
          const agents = await client.listAgents();
          const agentList = agents.length > 0
            ? agents.map((a) => `${a.name} [${a.skills.map((s) => s.id).join(", ")}]`).join(", ")
            : "none";
          return {
            content: [{
              type: "text" as const,
              text: `No agent available${params.skill ? ` with skill "${params.skill}"` : ""}.\nOnline: ${agentList}`,
            }],
            details: { error: "no_agent" },
          };
        }

        if (targetCard.name === card.name) {
          return {
            content: [{
              type: "text" as const,
              text: "Cannot delegate to yourself. Others: " +
                (await client.listAgents()).filter((a) => a.name !== card!.name).map((a) => a.name).join(", ") || "none",
            }],
            details: { error: "self_delegate" },
          };
        }

        // Submit task to shared state
        const taskId = await client.createTask({
          from: card.name,
          to: targetCard.name,
          skill: params.skill,
          task: params.task,
        });

        console.log(`[pipal-a2a] 📤 Task ${taskId.slice(0, 8)} → ${targetCard.name}: "${params.task.slice(0, 50)}..."`);

        // Wait for result
        const result = await client.waitForResult(taskId, { timeout: 120_000 });

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
}
