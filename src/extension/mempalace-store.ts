/**
 * mempalace-store.ts — Store Delegation Result in MemPalace
 *
 * One tool that calls all 3 post-delegation MCP tools:
 *   1. add_drawer → shared/project-status
 *   2. kg_add → completion fact
 *   3. diary_write → audit trail
 *
 * Per karpathy-clean-code: Infrastructure layer — wrapping, not defining.
 * Per our design: Post-hook via tool call, not extension code.
 */

import { Type } from "@sinclair/typebox";

interface StoreResultParams {
  projectName: string;
  agentRole: string;
  taskDescription: string;
  resultText: string;
  durationMs?: number;
}

/** Format status entry for shared/project-status */
function formatStatusEntry(params: StoreResultParams): string {
  const { agentRole, taskDescription, resultText, durationMs } = params;
  const date = new Date().toISOString().split("T")[0];
  const durationStr = durationMs ? ` (${Math.round(durationMs)}ms)` : "";
  const truncatedResult = resultText.slice(0, 300).replace(/\n/g, " ").trim();

  return [
    `### ${agentRole} (owner: ${agentRole})`,
    ``,
    `### ${date} | ${taskDescription}`,
    `- Result: ${truncatedResult || "completed"}${durationStr}`,
    ``,
  ].join("\n");
}

/** Check if mempalace CLI is available */
async function checkMempalace(): Promise<boolean> {
  try {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec("which mempalace", (error) => resolve(!error));
    });
  } catch {
    return false;
  }
}

/** Parse mempalace CLI error into readable message */
function parseMempalaceError(output: string, cmd: string[]): string {
  // Common error patterns
  if (output.includes("not found") || output.includes("command not found")) {
    return "mempalace CLI not found — install with: uv tool install mempalace";
  }
  if (output.includes("permission denied")) {
    return "mempalace permission denied";
  }
  if (output.includes("Error")) {
    const match = output.match(/Error:\s*(.+)/i);
    return match ? match[1] : "MemPalace error";
  }
  return `mempalace ${cmd[1]} failed`;
}

/**
 * Register the mempalace_store_result tool.
 * Call this from index.ts after pi.on("session_start").
 */
export function registerWriteMempalaceTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pipal_a2a_write_mempalace",
    label: "Store Delegation Result in MemPalace",
    description:
      "Store the result of a completed delegation in MemPalace. " +
      "Automatically calls: (1) add_drawer to shared/project-status, " +
      "(2) kg_add for completion fact, (3) diary_write for audit trail. " +
      "Call this after reading delegation results to update the shared status. " +
      "Wing: wing_pipal_a2a, Room: shared.",
    promptSnippet: "Store delegation result in MemPalace (shared/project-status + kg + diary)",
    promptGuidelines: [
      "IMPORTANT: After reading delegation results, call pipal_a2a_write_mempalace.",
      "Required params: projectName, agentRole (your role), taskDescription, resultText.",
      "Optional: durationMs for timing info.",
      "This tool handles 3 calls: add_drawer to shared/ + kg_add + diary_write.",
      "If this tool fails, fall back to calling MCP tools manually.",
      "Wing: wing_pipal_a2a, Room: shared.",
    ],
    parameters: Type.Object({
      projectName: Type.String({
        description: "Project name (e.g. btc-trading, todo-app, scratch)",
      }),
      agentRole: Type.String({
        description: "Your agent role (backend, frontend, reviewer, data, security, planner)",
      }),
      taskDescription: Type.String({
        description: "Brief description of the completed task",
      }),
      resultText: Type.String({
        description: "Result text from the delegation (will be truncated to 300 chars)",
      }),
      durationMs: Type.Optional(Type.Number({
        description: "Duration in milliseconds (optional, shown in status)",
      })),
    }),
    async execute(toolCallId, params: StoreResultParams, signal, onUpdate, ctx) {
      const { projectName, agentRole, taskDescription, resultText, durationMs } = params;
      const content = formatStatusEntry({ projectName, agentRole, taskDescription, resultText, durationMs });

      // Check if mempalace is available
      const hasMempalace = await checkMempalace();
      if (!hasMempalace) {
        return {
          content: [{
            type: "text" as const,
            text: `⚠️ mempalace CLI not found. Install with: uv tool install mempalace`,
          }],
          details: { error: "mempalace not installed", projectName, agentRole },
        };
      }

      // Use pi.exec to call mempalace CLI
      // mempalace add --wing wing_pipal_a2a --room shared --content "..."
      const results: Array<{ cmd: string; success: boolean; output: string }> = [];

      // 1. add_drawer
      try {
        const addResult = await pi.exec("mempalace", [
          "add",
          "--wing", "wing_pipal_a2a",
          "--room", "shared",
          "--content", content,
        ]);
        results.push({ cmd: "mempalace add", success: addResult.exitCode === 0, output: addResult.stdout });
      } catch (err) {
        results.push({ cmd: "mempalace add", success: false, output: String(err) });
      }

      // 2. kg_add
      try {
        const kgResult = await pi.exec("mempalace", [
          "kg", "add",
          "--subject", projectName,
          "--predicate", `has_${agentRole}`,
          "--object", "completed",
        ]);
        results.push({ cmd: "mempalace kg add", success: kgResult.exitCode === 0, output: kgResult.stdout });
      } catch (err) {
        results.push({ cmd: "mempalace kg add", success: false, output: String(err) });
      }

      // 3. diary_write
      try {
        const diaryEntry = `PROJ:${projectName}|TASK:${taskDescription}|AGENT:${agentRole}|★★★★`;
        const diaryResult = await pi.exec("mempalace", [
          "diary", "write",
          "--entry", diaryEntry,
        ]);
        results.push({ cmd: "mempalace diary write", success: diaryResult.exitCode === 0, output: diaryResult.stdout });
      } catch (err) {
        results.push({ cmd: "mempalace diary write", success: false, output: String(err) });
      }

      // Summarize results
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      if (failCount === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `✅ MemPalace updated: ${projectName} → shared/project-status, KG, diary`,
          }],
          details: { projectName, agentRole, successCount, results },
        };
      } else {
        return {
          content: [{
            type: "text" as const,
            text: `⚠️ MemPalace partial update: ${successCount}/3 succeeded. ${failCount} failed.`,
          }],
          details: { projectName, agentRole, successCount, failCount, results },
        };
      }
    },
  });
}