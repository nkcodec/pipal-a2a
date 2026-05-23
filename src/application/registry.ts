/**
 * PiPal-A2A Application — Agent Registry
 * 
 * karpathy-clean-code: Application layer.
 * No business logic — only coordinates agent registration.
 * Implements SDK AgentRegistry interface.
 */

import type { AgentCard, AgentRegistry } from "../sdk/index.js";

export class InMemoryAgentRegistry implements AgentRegistry {
  private agents = new Map<string, AgentCard>();
  
  register(card: AgentCard): void {
    this.agents.set(card.name, card);
    const skills = card.skills.map(s => s.id).join(", ");
    console.log(`[Registry] Registered: ${card.name} [${skills}]`);
  }
  
  unregister(agentId: string): void {
    this.agents.delete(agentId);
    console.log(`[Registry] Unregistered: ${agentId}`);
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


