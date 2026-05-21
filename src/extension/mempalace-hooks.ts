// mempalace-hooks.ts — Implementation: PreHook/PostHook for MemPalace
// Per karpatha-clean-code: Surgical changes, best-effort, never block.

import {
  resolveProjectName,
  mergeDrawerContent,
  type MempalaceConfig,
} from "./mempalace-types";

/** MCP call wrapper — will be injected from mempalace.ts */
type McpCaller = (tool: string, args: Record<string, unknown>) => Promise<any>;

/** Context passed from hooks to the task */
export interface MempalaceContext {
  facts: any[] | null;
  priorWork: string | null;
}

/**
 * PreHook: Query MemPalace for context before agent starts task.
 * 2 calls, parallel, best-effort. Never blocks.
 */
export async function mempalacePreHook(
  mcpCall: McpCaller,
  config: MempalaceConfig,
  agentRole: string,
  workflowName: string | undefined,
  cwd: string
): Promise<MempalaceContext> {
  if (!config.enabled || !config.autoQuery || !mcpCall) {
    return { facts: null, priorWork: null };
  }

  const projectName = resolveProjectName(workflowName, cwd);

  try {
    const [kgResult, searchResult] = await Promise.all([
      mcpCall("mempalace_mempalace_kg_query", { entity: projectName }).catch(() => null),
      mcpCall("mempalace_mempalace_search", {
        query: projectName,
        wing: config.wing,
        room: agentRole,
      }).catch(() => null),
    ]);

    const facts = kgResult?.facts || null;
    const priorWork = searchResult?.results?.[0]?.content || null;

    return { facts, priorWork };
  } catch (err) {
    console.warn(`[pipal-a2a] ⚠️ MemPalace PreHook failed: ${err}`);
    return { facts: null, priorWork: null };
  }
}

/**
 * PostHook: Store results in MemPalace after agent finishes task.
 * 4 calls, allSettled, best-effort. Never blocks.
 */
export async function mempalacePostHook(
  mcpCall: McpCaller,
  config: MempalaceConfig,
  agentRole: string,
  workflowName: string | undefined,
  cwd: string,
  taskText: string,
  resultText: string
): Promise<void> {
  if (!config.enabled || !config.autoStore || !mcpCall) {
    return;
  }

  const projectName = resolveProjectName(workflowName, cwd);

  const results = await Promise.allSettled([
    // 1. Store/update drawer (read-before-write, client-side merge)
    storeOrUpdateDrawer(mcpCall, config, agentRole, projectName, resultText),

    // 2. Update KG (query-then-invalidate-then-add)
    updateKG(mcpCall, projectName, agentRole),

    // 3. Write diary entry
    mcpCall("mempalace_mempalace_diary_write", {
      entry: `PROJ:${projectName}|TASK:${taskText.slice(0, 80)}|AGENT:${agentRole}|★★★★`,
    }),
  ]);

  // Log failures, never throw
  const names = ["drawer", "kg", "diary"];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`[pipal-a2a] ⚠️ ${names[i]} store failed: ${r.reason}`);
    }
  });
}

/** Store or update drawer with client-side merge */
async function storeOrUpdateDrawer(
  mcpCall: McpCaller,
  config: MempalaceConfig,
  agentRole: string,
  projectName: string,
  resultText: string
): Promise<void> {
  // Read existing
  const existing = await mcpCall("mempalace_mempalace_search", {
    query: projectName,
    wing: config.wing,
    room: agentRole,
  }).catch(() => null);

  const existingContent = existing?.results?.[0]?.content;
  const existingId = existing?.results?.[0]?.drawer_id;

  const newContent = `# ${projectName}\n\n## What I Built\n${resultText}\n\n## Updated: ${new Date().toISOString().split("T")[0]}\n`;

  if (existingContent && existingId) {
    // Merge: preserve History, replace rest
    const merged = mergeDrawerContent(existingContent, newContent);
    await mcpCall("mempalace_mempalace_update_drawer", {
      drawer_id: existingId,
      content: merged,
    });
  } else {
    // New drawer
    await mcpCall("mempalace_mempalace_add_drawer", {
      wing: config.wing,
      room: agentRole,
      content: newContent,
    });
  }
}

/** Update KG: query old value, invalidate, add new */
async function updateKG(
  mcpCall: McpCaller,
  projectName: string,
  agentRole: string
): Promise<void> {
  // Query existing facts
  const current = await mcpCall("mempalace_mempalace_kg_query", {
    entity: projectName,
  }).catch(() => null);

  // Invalidate old "has_{role}" fact if exists
  const facts = current?.facts || [];
  const match = facts.find((f: any) => f.predicate === `has_${agentRole}`);
  if (match) {
    await mcpCall("mempalace_mempalace_kg_invalidate", {
      subject: projectName,
      predicate: match.predicate,
      object: match.object,
    }).catch(() => {});
  }

  // Add new fact
  await mcpCall("mempalace_mempalace_kg_add", {
    subject: projectName,
    predicate: `has_${agentRole}`,
    object: "completed",
  });
}
