/**
 * PiPal-A2A Application — Network Type Helpers
 * 
 * Shared types for HOST/JOIN modes.
 */

import type { AgentCard } from "../core/types.js";

export interface AgentNetwork {
  readonly sharedStateUrl: string;
  readonly card: AgentCard;
  shutdown(): Promise<void>;
}
