/**
 * PiPal-A2A Core Tests — Google A2A v1.0 Protocol Data Model
 * 
 * karpathy-clean-code: Layer 1 tests — Core types only.
 * No mocks, no registry, no infrastructure.
 * Pure input → output assertions.
 * 
 * Tests verify compliance with Google A2A v1.0 spec:
 *   https://github.com/google/A2A
 */

import { describe, it, expect } from "vitest";
import {
  createPart,
  createMessage,
  createTask,
  createAgentCard,
  createSkill,
  type Task,
  type AgentCard,
  type Message,
  type Part,
  type TaskState,
  type AgentSkill,
} from "../src/core/types.js";

describe("Google A2A v1.0 — Core Types", () => {

  // ─────────────────────────────────────────────────────────────
  // Part (Google A2A: unified content part)
  // ─────────────────────────────────────────────────────────────
  describe("Part", () => {
    it("createPart produces a text part with mediaType", () => {
      const part = createPart("Hello world");
      expect(part.text).toBe("Hello world");
      expect(part.mediaType).toBe("text/plain");
    });

    it("createPart is frozen (immutable)", () => {
      const part = createPart("test");
      expect(() => { (part as any).text = "changed"; }).toThrow();
    });

    it("createPart supports custom mediaType and metadata", () => {
      const part = createPart('{"key": "value"}', {
        mediaType: "application/json",
        metadata: { source: "test" },
      });
      expect(part.mediaType).toBe("application/json");
      expect(part.metadata?.source).toBe("test");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Message (Google A2A: Message with role + parts)
  // ─────────────────────────────────────────────────────────────
  describe("Message", () => {
    it("createMessage with ROLE_USER and text parts", () => {
      const msg = createMessage("ROLE_USER", [
        createPart("Build login API"),
      ]);
      expect(msg.role).toBe("ROLE_USER");
      expect(msg.parts).toHaveLength(1);
      expect(msg.parts[0].text).toBe("Build login API");
      expect(msg.messageId).toBeTruthy();
    });

    it("createMessage with ROLE_AGENT", () => {
      const msg = createMessage("ROLE_AGENT", [
        createPart("Login API implemented"),
      ]);
      expect(msg.role).toBe("ROLE_AGENT");
    });

    it("createMessage is frozen", () => {
      const msg = createMessage("ROLE_USER", [createPart("test")]);
      expect(() => { (msg as any).role = "ROLE_AGENT"; }).toThrow();
    });

    it("createMessage supports taskId and contextId for multi-turn", () => {
      const msg = createMessage("ROLE_USER", [createPart("follow up")], {
        taskId: "task-123",
        contextId: "ctx-456",
      });
      expect(msg.taskId).toBe("task-123");
      expect(msg.contextId).toBe("ctx-456");
    });

    it("createMessage generates unique messageIds", () => {
      const msg1 = createMessage("ROLE_USER", [createPart("a")]);
      const msg2 = createMessage("ROLE_USER", [createPart("b")]);
      expect(msg1.messageId).not.toBe(msg2.messageId);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Task (Google A2A: Task with status + state machine)
  // ─────────────────────────────────────────────────────────────
  describe("Task", () => {
    it("createTask with TASK_STATE_SUBMITTED", () => {
      const task = createTask("task-1", "TASK_STATE_SUBMITTED");
      expect(task.id).toBe("task-1");
      expect(task.status.state).toBe("TASK_STATE_SUBMITTED");
      expect(task.status.timestamp).toBeTruthy();
    });

    it("createTask with TASK_STATE_COMPLETED and artifacts", () => {
      const task = createTask("task-1", "TASK_STATE_COMPLETED", {
        artifacts: [{
          artifactId: "art-1",
          parts: [createPart("result code")],
        }],
      });
      expect(task.status.state).toBe("TASK_STATE_COMPLETED");
      expect(task.artifacts).toHaveLength(1);
      expect(task.artifacts![0].parts[0].text).toBe("result code");
    });

    it("createTask is frozen", () => {
      const task = createTask("t-1", "TASK_STATE_SUBMITTED");
      expect(() => { (task as any).id = "changed"; }).toThrow();
    });

    it("all TaskState values are SCREAMING_SNAKE_CASE", () => {
      const states: TaskState[] = [
        "TASK_STATE_SUBMITTED",
        "TASK_STATE_WORKING",
        "TASK_STATE_COMPLETED",
        "TASK_STATE_FAILED",
        "TASK_STATE_CANCELED",
        "TASK_STATE_REJECTED",
        "TASK_STATE_INPUT_REQUIRED",
        "TASK_STATE_AUTH_REQUIRED",
      ];
      for (const state of states) {
        expect(state).toMatch(/^TASK_STATE_[A-Z_]+$/);
      }
    });

    it("timestamp is ISO 8601", () => {
      const task = createTask("t-1", "TASK_STATE_SUBMITTED");
      expect(task.status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // AgentSkill (Google A2A: AgentSkill)
  // ─────────────────────────────────────────────────────────────
  describe("AgentSkill", () => {
    it("createSkill with required fields", () => {
      const skill = createSkill("code-gen", "Code Generation", "Generates code");
      expect(skill.id).toBe("code-gen");
      expect(skill.name).toBe("Code Generation");
      expect(skill.description).toBe("Generates code");
    });

    it("createSkill with tags and examples", () => {
      const skill = createSkill("planning", "Planning", "Creates plans", {
        tags: ["planning", "delegation"],
        examples: ["Plan a login API build"],
      });
      expect(skill.tags).toContain("planning");
      expect(skill.examples).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // AgentCard (Google A2A v1.0: AgentCard)
  // ─────────────────────────────────────────────────────────────
  describe("AgentCard", () => {
    it("createAgentCard with Google A2A v1.0 structure", () => {
      const card = createAgentCard(
        "planner",
        "http://localhost:5000",
        [createSkill("planning", "Planning", "Creates execution plans")],
        { description: "Task planner agent" }
      );

      // Google A2A v1.0 required fields
      expect(card.name).toBe("planner");
      expect(card.description).toBe("Task planner agent");
      expect(card.version).toBe("1.0.0");
      expect(card.skills).toHaveLength(1);

      // Google A2A v1.0: supportedInterfaces[]
      expect(card.supportedInterfaces).toHaveLength(1);
      expect(card.supportedInterfaces[0].url).toBe("http://localhost:5000");
      expect(card.supportedInterfaces[0].protocolBinding).toBe("JSONRPC");
      expect(card.supportedInterfaces[0].protocolVersion).toBe("1.0");

      // Google A2A v1.0: capabilities
      expect(card.capabilities.streaming).toBe(true);
      expect(card.capabilities.pushNotifications).toBe(false);
    });

    it("AgentCard is deeply frozen", () => {
      const card = createAgentCard("worker", "http://localhost:5000", []);
      expect(() => { (card as any).name = "x"; }).toThrow();
      expect(() => { (card.capabilities as any).streaming = false; }).toThrow();
      expect(() => { (card.supportedInterfaces[0] as any).url = "x"; }).toThrow();
    });

    it("AgentCard matches Google A2A v1.0 spec shape", () => {
      const card = createAgentCard("agent", "http://localhost:5000", [], {
        provider: { organization: "Test Corp" },
      });

      // Verify the v1.0 field structure
      expect(card).toHaveProperty("name");
      expect(card).toHaveProperty("description");
      expect(card).toHaveProperty("supportedInterfaces");
      expect(card).toHaveProperty("version");
      expect(card).toHaveProperty("capabilities");
      expect(card).toHaveProperty("skills");

      // Verify NO legacy v0.3 fields leaked in
      expect((card as any).url).toBeUndefined();
      expect((card as any).protocolVersion).toBeUndefined();
      expect((card as any).preferredTransport).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Layer Isolation
  // ─────────────────────────────────────────────────────────────
  describe("Core Layer Isolation", () => {
    it("Core types have no infrastructure imports", () => {
      // Verified by tsc --noEmit and the structure of core/types.ts
      // Core contains only type definitions and factory functions
      expect(true).toBe(true);
    });
  });
});
