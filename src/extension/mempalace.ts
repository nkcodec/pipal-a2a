// mempalace.ts — Wiring: MCP client + config + lifecycle integration
// Per karpatha-clean-code: Config activates, not defines. Best-effort.

import {
  DEFAULT_MEMPALACE_CONFIG,
  type MempalaceConfig,
} from "./mempalace-types";

import {
  mempalacePreHook,
  mempalacePostHook,
  type MempalaceContext,
} from "./mempalace-hooks";

/** MCP call function type */
type McpCaller = (tool: string, args: Record<string, unknown>) => Promise<any>;

/** Load mempalace config from pipal-a2a.yaml data */
export function loadMempalaceConfig(yamlData: any): MempalaceConfig {
  if (!yamlData?.mempalace) return DEFAULT_MEMPALACE_CONFIG;
  return {
    enabled: yamlData.mempalace.enabled ?? DEFAULT_MEMPALACE_CONFIG.enabled,
    wing: yamlData.mempalace.wing ?? DEFAULT_MEMPALACE_CONFIG.wing,
    autoQuery: yamlData.mempalace.autoQuery ?? DEFAULT_MEMPALACE_CONFIG.autoQuery,
    autoStore: yamlData.mempalace.autoStore ?? DEFAULT_MEMPALACE_CONFIG.autoStore,
  };
}

/** Create MCP caller function — wraps raw MCP call */
export function createMcpCaller(
  rawMcpCall: ((tool: string, args: Record<string, unknown>) => Promise<any>) | null | undefined
): McpCaller | null {
  if (!rawMcpCall) return null;

  return async (tool: string, args: Record<string, unknown>) => {
    return rawMcpCall(tool, args);
  };
}

/** MemPalace integration — holds config and MCP caller */
export class MempalaceIntegration {
  private config: MempalaceConfig;
  private mcpCall: McpCaller | null;

  constructor(config: MempalaceConfig, mcpCall: McpCaller | null) {
    this.config = config;
    this.mcpCall = mcpCall;
  }

  /** Check if mempalace is enabled and MCP is available */
  get isActive(): boolean {
    return this.config.enabled && this.mcpCall !== null;
  }

  /** Run PreHook — returns context or null if disabled/unavailable */
  async preHook(
    agentRole: string,
    workflowName: string | undefined,
    cwd: string
  ): Promise<MempalaceContext | null> {
    if (!this.mcpCall) return null;
    return mempalacePreHook(
      this.mcpCall,
      this.config,
      agentRole,
      workflowName,
      cwd
    );
  }

  /** Run PostHook — stores results if enabled */
  async postHook(
    agentRole: string,
    workflowName: string | undefined,
    cwd: string,
    taskText: string,
    resultText: string
  ): Promise<void> {
    if (!this.mcpCall) return;
    return mempalacePostHook(
      this.mcpCall,
      this.config,
      agentRole,
      workflowName,
      cwd,
      taskText,
      resultText
    );
  }
}
