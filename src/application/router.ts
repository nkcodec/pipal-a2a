/**
 * PiPal-A2A Application — Task Router
 * 
 * karpathy-clean-code: Application layer.
 * Routes tasks to agents based on skills or custom strategies.
 * Implements SDK TaskRouter interface.
 */

import type { 
  AgentCard, 
  TaskRouter, 
  RoutingStrategy,
  A2AMessage,
} from "../sdk/index.js";
import type { AgentRegistry } from "../sdk/index.js";
import { SkillMatcher } from "../builtin/skill-matcher.js";

/**
 * DefaultTaskRouter — routes tasks to agents based on skills
 * 
 * Uses SkillMatcher by default.
 * Custom strategies can be injected via setStrategy().
 */
export class DefaultTaskRouter implements TaskRouter {
  private strategy: RoutingStrategy;
  
  constructor(
    private registry: AgentRegistry,
    customStrategy?: RoutingStrategy
  ) {
    this.strategy = customStrategy ?? new SkillMatcher();
  }
  
  async route(message: A2AMessage): Promise<AgentCard | undefined> {
    const { to, skill } = message;
    
    // Direct routing — if "to" is specified and not broadcast
    if (to !== "*") {
      const target = this.registry.get(to);
      if (target) return target;
    }
    
    // Skill-based routing — find agents with required skill
    if (skill) {
      const candidates = this.registry.findBySkill(skill);
      if (candidates.length > 0) {
        return this.strategy.select(message, candidates);
      }
    }
    
    // Fallback — pick any available agent
    const allAgents = this.registry.list();
    if (allAgents.length > 0) {
      return this.strategy.select(message, allAgents);
    }
    
    return undefined; // No agent available
  }
  
  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
  }
}

// Protocol compliance check
import type { TaskRouter as TaskRouterType } from "../sdk/index.js";
const _router: TaskRouterType = new DefaultTaskRouter({ 
  register: () => {}, 
  unregister: () => {}, 
  get: () => undefined, 
  findBySkill: () => [], 
  list: () => [] 
});
