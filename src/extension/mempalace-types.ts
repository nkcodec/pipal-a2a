// mempalace-types.ts — SDK: types, interfaces, constants
// Per karpathy-clean-code: SDK contains only types, not behavior.

/** MemPalace config from pipal-a2a.yaml */
export interface MempalaceConfig {
  enabled: boolean;
  wing: string;        // always "wing_a2a"
  autoQuery: boolean;  // PreHook queries palace
  autoStore: boolean;  // PostHook stores results
}

/** Default config when mempalace not in YAML */
export const DEFAULT_MEMPALACE_CONFIG: MempalaceConfig = {
  enabled: false,
  wing: "wing_a2a",
  autoQuery: true,
  autoStore: true,
};

/** Project name resolution result */
export function resolveProjectName(
  workflowName: string | undefined,
  cwd: string
): string {
  if (workflowName) return workflowName;
  const base = cwd.split("/").pop() || "";
  if (base && base !== "pipal-a2a" && base !== "src") return base;
  return "scratch";
}

/** Shared room write ownership map — who can write what */
export const SHARED_WRITE_OWNERSHIP: Record<string, string> = {
  "api-spec": "backend",
  "db-schema": "backend",
  "project-spec": "planner",
  "security-checklist": "security",
  "env-schema": "backend",
  "data-schema": "data",
};

/** Check if agent can write to shared room */
export function canWriteShared(agentRole: string, docType: string): boolean {
  const owner = SHARED_WRITE_OWNERSHIP[docType];
  return !owner || owner === agentRole;
}

/** Extract a markdown section from content */
export function extractSection(content: string, heading: string): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];
  for (const line of lines) {
    if (line === `## ${heading}`) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) {
      break;
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }
  return sectionLines.join("\n").trim();
}

/** Merge drawer content — preserves History, replaces everything else */
export function mergeDrawerContent(existing: string, newContent: string): string {
  const history = extractSection(existing, "History");
  const prevSummary = extractSection(existing, "What I Built");
  const prevDate = extractSection(existing, "Updated");
  const dateStr = prevDate || new Date().toISOString().split("T")[0];

  const historyEntry = `- ${dateStr}: ${prevSummary.slice(0, 200)}`;
  const newHistory = history ? `${historyEntry}\n${history}` : historyEntry;

  return newContent.replace(
    "## History",
    `## History\n${newHistory}`
  );
}
