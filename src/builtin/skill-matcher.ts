/**
 * PiPal-A2A Builtin — Default Routing Strategy
 * 
 * karpathy-clean-code: Built-in implementation of SDK interface.
 * Moved out of SDK — SDK contains only types, never implementations.
 * 
 * Routes tasks to agents that declare the required skill.
 */

import type { RoutingStrategy } from "../sdk/index.js";
import type { Task, AgentCard } from "../core/types.js";

/**
 * SkillMatcher — default routing strategy
 * 
 * Matches tasks to agents based on skill metadata.
 * Falls back to first available agent if no skill is specified.
 * 
 * In Google A2A, task routing is client-side: the client reads
 * AgentCards and picks the right agent. This class automates that.
 */
export class SkillMatcher implements RoutingStrategy {
  readonly priority = 50;
  
  select(task: Task, candidates: AgentCard[]): AgentCard | undefined {
    if (candidates.length === 0) return undefined;
    
    // Try to extract skill hint from task metadata
    const skillHint = task.metadata?.["skill"] as string | undefined;
    
    // No skill hint — pick first available
    if (!skillHint) {
      return candidates[0];
    }
    
    // Find agent with matching skill
    return candidates.find(card => 
      card.skills.some(s => s.id === skillHint)
    );
  }
}

// Protocol compliance check at definition time
const _matcher: RoutingStrategy = new SkillMatcher();
