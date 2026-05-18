/**
 * PiPal-A2A — Pi Extension Entry Point
 * 
 * karpathy-clean-code: Presentation layer.
 * This is the main entry point when loaded as a pi extension.
 * Registers tools, commands, and lifecycle events into pi's runtime.
 * 
 * Usage: pi install ./pipal-a2a
 * 
 * pi loads this via jiti (TypeScript works without compilation).
 * Factory receives ExtensionAPI — registers the extension's capabilities.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { bootstrapNetwork, type AgentNetwork } from "../application/network.js";

export default function (pi: ExtensionAPI) {
  let network: AgentNetwork | null = null;

  // ───────────────────────────────────────────────────────────────
  // Lifecycle: start network when pi session starts
  // ───────────────────────────────────────────────────────────────
  pi.on("session_start", async () => {
    try {
      network = await bootstrapNetwork();
    } catch (error) {
      console.error("[pipal-a2a] Failed to bootstrap network:", error);
    }
  });

  // Lifecycle: tear down network when pi session ends
  pi.on("session_shutdown", async () => {
    if (network) {
      await network.shutdown();
      network = null;
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Tool: pipal_a2a_delegate
  // ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pipal_a2a_delegate",
    label: "Delegate to Agent Network",
    description:
      "Send a task to the P2P agent network. " +
      "The task routes to the best available agent based on required skills. " +
      "Returns the agent's result.",
    promptSnippet: "Delegate subtasks to specialized agents for parallel execution",
    promptGuidelines: [
      "Use pipal_a2a_delegate when a task can benefit from a specialized agent (planning, code generation, security review, frontend, backend).",
      "Specify skill to route to the right agent: planning, code-generation, security-review, frontend-implementation, backend-implementation.",
      "Specify to to send directly to a named agent (bypasses routing).",
      "You can call this tool multiple times to parallelize work across agents.",
    ],
    parameters: Type.Object({
      task: Type.String({
        description: "The task description to delegate to the agent network",
      }),
      skill: Type.Optional(
        Type.String({
          description:
            "Required skill ID for routing. Options: planning, delegation, code-generation, backend-implementation, frontend-implementation, security-review, code-review",
        })
      ),
      to: Type.Optional(
        Type.String({
          description: "Specific agent ID to send to directly (bypasses skill-based routing)",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!network) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Agent network not started. Try /pipal-status to check.",
            },
          ],
          details: { error: "network_not_started" },
        };
      }

      try {
        const result = await network.delegate({
          task: params.task,
          skill: params.skill,
          to: params.to,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent network error: ${error instanceof Error ? error.message : String(error)}`,
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
    description: "Show P2P agent network status",
    handler: async (_args, ctx) => {
      if (!network) {
        ctx.ui.notify("Agent network not started", "warning");
        return;
      }

      const agents = network.listAgents();
      if (agents.length === 0) {
        ctx.ui.notify("No agents configured. Check config/agents.yaml", "warning");
        return;
      }

      const status = agents
        .map((a) => `  ${a.name}: [${a.skills.join(", ")}] → ${a.endpoint}`)
        .join("\n");

      ctx.ui.notify(`${agents.length} agent(s) online:\n${status}`, "info");
    },
  });
}
