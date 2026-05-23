/**
 * Agent Isolation — Strategy Interface
 *
 * karpathy-clean-code: Strategy pattern (same as RoutingStrategy).
 * Config activates, not defines. Core frozen — this is builtin layer.
 *
 * Two implementations:
 *   NoIsolation       — default, agents share cwd, zero overhead
 *   WorktreeIsolation — git worktree per agent, prevents file conflicts
 */

export interface IsolationStrategy {
  /** Prepare isolated workspace for an agent. Returns working directory. */
  prepare(agentName: string): Promise<string>;

  /** Finalize after task completes (commit, etc). Returns success status. */
  finalize(agentName: string): Promise<{ success: boolean; error?: string }>;

  /** Get the working directory for an agent. */
  getWorkDir(agentName: string): string;

  /** Cleanup on agent disconnect. */
  cleanup(agentName: string): Promise<void>;
}
