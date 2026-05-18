/**
 * PiPal-A2A Application — Network Helpers
 * 
 * Utility functions for HOST/JOIN modes.
 * The extension handles most logic directly, but these helpers
 * are shared between extension and CLI.
 */

import type { AgentCard } from "../core/types.js";

/**
 * Network handle — returned by host/join helpers.
 * The extension uses SharedStateClient directly for richer interaction.
 * This is provided for CLI and programmatic usage.
 */
export interface AgentNetwork {
  readonly sharedStateUrl: string;
  readonly card: AgentCard;
  shutdown(): Promise<void>;
}
