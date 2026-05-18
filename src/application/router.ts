/**
 * PiPal-A2A Application — Task Router
 * 
 * karpathy-clean-code: Application layer.
 * Routes tasks to agents based on skills or custom strategies.
 * Implements SDK TaskRouter interface.
 * 
 * In Google A2A, routing is client-side: read AgentCards, pick the right agent.
 * This class automates that decision.
 */

import type { 
  AgentCard, 
  TaskRouter, 
  RoutingStrategy,
  Task,
} from "../sdk/index.js";
import type { AgentRegistry } from "../sdk/index.js";
import { SkillMatcher } from "../builtin/skill-matcher.js";

export class DefaultTaskRouter implements TaskRouter {
  private strategy: RoutingStrategy;
  
  constructor(
    private registry: AgentRegistry,
    customStrategy?: RoutingStrategy
  ) {
    this.strategy = customStrategy ?? new SkillMatcher();
  }
  
  async route(task: Task): Promise<AgentCard | undefined> {
    const targetName = task.metadata?.["to"] as string | undefined;
    const skillHint = task.metadata?.["skill"] as string | undefined;
    
    // Direct routing — target agent specified
    if (targetName) {
      const target = this.registry.get(targetName);
      if (target) return target;
    }
    
    // Skill-based routing — find agents with required skill
    if (skillHint) {
      const candidates = this.registry.findBySkill(skillHint);
      if (candidates.length > 0) {
        return this.strategy.select(task, candidates);
      }
    }
    
    // Fallback — pick any available agent
    const allAgents = this.registry.list();
    if (allAgents.length > 0) {
      return this.strategy.select(task, allAgents);
    }
    
    return undefined;
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
