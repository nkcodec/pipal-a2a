/**
 * PiPal-A2A Builtin — Default Routing Strategy
 * 
 * karpathy-clean-code: Built-in implementation of SDK interface.
 * Moved out of SDK — SDK contains only types, never implementations.
 * 
 * This proves the RoutingStrategy interface works and provides
 * a default that can be replaced by custom strategies.
 */

import type { RoutingStrategy } from "../sdk/index.js";
import type { A2AMessage, AgentCard } from "../core/types.js";

/**
 * SkillMatcher — default routing strategy
 * 
 * Matches tasks to agents that declare the required skill.
 * Falls back to first available agent if no skill is specified.
 */
export class SkillMatcher implements RoutingStrategy {
  readonly priority = 50;
  
  select(message: A2AMessage, candidates: AgentCard[]): AgentCard | undefined {
    if (candidates.length === 0) return undefined;
    
    // No skill required — pick first available
    if (!message.skill) {
      return candidates[0];
    }
    
    // Find agent with matching skill
    return candidates.find(card => 
      card.skills.some(s => s.id === message.skill)
    );
  }
}

// Protocol compliance check at definition time
const _matcher: RoutingStrategy = new SkillMatcher();
