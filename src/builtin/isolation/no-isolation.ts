/**
 * NoIsolation — default strategy.
 *
 * Agents share the current working directory.
 * Zero overhead, zero side effects. Current behavior.
 */

import type { IsolationStrategy } from "./isolation.js";

export class NoIsolation implements IsolationStrategy {
  private readonly cwd: string;

  constructor() {
    this.cwd = process.cwd();
  }

  async prepare(_agentName: string): Promise<string> {
    return this.cwd;
  }

  async finalize(_agentName: string): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  getWorkDir(_agentName: string): string {
    return this.cwd;
  }

  async cleanup(_agentName: string): Promise<void> {
    // Nothing to clean up
  }
}
