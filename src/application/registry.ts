/**
 * PiPal-A2A Application — Agent Registry
 * 
 * karpathy-clean-code: Application layer.
 * No business logic — only coordinates agent registration.
 * Implements SDK AgentRegistry interface.
 */

import type { AgentCard, AgentRegistry } from "../sdk/index.js";

/**
 * InMemoryAgentRegistry — maintains agent cards
 * 
 * Simple Map-based registry.
 * Can be replaced with distributed registry (Redis, etc.) at v2.
 */
export class InMemoryAgentRegistry implements AgentRegistry {
  private agents = new Map<string, AgentCard>();
  
  register(card: AgentCard): void {
    this.agents.set(card.name, card);
    console.log(`[Registry] Registered agent: ${card.name} (${card.skills.map(s => s.id).join(", ")})`);
  }
  
  unregister(agentId: string): void {
    this.agents.delete(agentId);
    console.log(`[Registry] Unregistered agent: ${agentId}`);
  }
  
  get(agentId: string): AgentCard | undefined {
    return this.agents.get(agentId);
  }
  
  findBySkill(skillId: string): AgentCard[] {
    return Array.from(this.agents.values()).filter(card =>
      card.skills.some(skill => skill.id === skillId)
    );
  }
  
  list(): AgentCard[] {
    return Array.from(this.agents.values());
  }
}

// Protocol compliance check
import type { AgentRegistry as AgentRegistryType } from "../sdk/index.js";
const _registry: AgentRegistryType = new InMemoryAgentRegistry();
