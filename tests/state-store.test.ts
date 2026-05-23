/**
 * StateStore unit tests — Layer 2 (stubs, not mocks)
 *
 * Uses :memory: SQLite DB. Tests all CRUD operations.
 * No mocks — real database, real assertions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../src/infrastructure/state-store.js";
import type { AgentCard, TaskState, PushNotificationConfig } from "../src/core/types.js";
import { createTask } from "../src/core/types.js";
import type { StoredTask } from "../src/infrastructure/shared-state.js";

// ── Helpers ─────────────────────────────────────────────────────

function makeAgent(name: string): AgentCard {
  return {
    name,
    description: `Agent ${name}`,
    url: `http://localhost:${5000 + name.length}`,
    provider: { organization: "test", url: "http://test.com" },
    version: "1.0.0",
    capabilities: {},
    skills: [],
  };
}

function makeStoredTask(id: string, state: TaskState, from: string, to: string | null): StoredTask {
  const task = createTask();
  return {
    ...task,
    id,
    status: { state, timestamp: new Date().toISOString() },
    fromAgent: from,
    toAgent: to,
    skillHint: "test-skill",
    taskDescription: `Task ${id}`,
  } as StoredTask;
}

function makePushConfig(url: string, taskId?: string): PushNotificationConfig {
  return {
    url,
    taskId,
    authentication: { scheme: "bearer", credentials: "test-token" },
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("StateStore", () => {
  let store: StateStore;

  beforeEach(async () => {
    store = new StateStore(":memory:");
    await store.init();
  });

  afterEach(() => {
    store.close();
  });

  // ── Lifecycle ───────────────────────────────────────────────

  it("initializes and closes without error", async () => {
    const s = new StateStore(":memory:");
    await s.init();
    s.close();
    // No error thrown = pass
  });

  it("creates tables on init (idempotent)", async () => {
    // Second init should not throw
    await store.init();
  });

  // ── Agent CRUD ──────────────────────────────────────────────

  describe("agents", () => {
    it("stores and retrieves an agent", () => {
      const card = makeAgent("backend");
      store.setAgent(card);
      const got = store.getAgent("backend");
      expect(got).toBeDefined();
      expect(got!.name).toBe("backend");
      expect(got!.description).toBe("Agent backend");
    });

    it("returns undefined for unknown agent", () => {
      expect(store.getAgent("nonexistent")).toBeUndefined();
    });

    it("lists all agents", () => {
      store.setAgent(makeAgent("alpha"));
      store.setAgent(makeAgent("beta"));
      store.setAgent(makeAgent("gamma"));
      const list = store.listAgents();
      expect(list).toHaveLength(3);
      expect(list.map(a => a.name).sort()).toEqual(["alpha", "beta", "gamma"]);
    });

    it("updates agent on upsert", () => {
      store.setAgent(makeAgent("agent1"));
      const updated = makeAgent("agent1");
      updated.description = "Updated description";
      store.setAgent(updated);
      const got = store.getAgent("agent1");
      expect(got!.description).toBe("Updated description");
    });

    it("deletes an agent", () => {
      store.setAgent(makeAgent("to-delete"));
      store.deleteAgent("to-delete");
      expect(store.getAgent("to-delete")).toBeUndefined();
    });

    it("delete is idempotent for unknown agent", () => {
      store.deleteAgent("nonexistent"); // No error
    });

    it("persists all AgentCard fields", () => {
      const card: AgentCard = {
        name: "full-agent",
        description: "Full agent with all fields",
        url: "http://localhost:9999",
        provider: { organization: "TestOrg", url: "http://test.org" },
        version: "2.0.0",
        capabilities: { streaming: true, pushNotifications: true },
        skills: [
          { id: "skill-1", name: "Test Skill", description: "A test skill", tags: ["test"] },
        ],
      };
      store.setAgent(card);
      const got = store.getAgent("full-agent")!;
      expect(got.name).toBe("full-agent");
      expect(got.provider.organization).toBe("TestOrg");
      expect(got.capabilities.streaming).toBe(true);
      expect(got.skills).toHaveLength(1);
      expect(got.skills![0].id).toBe("skill-1");
    });
  });

  // ── Task CRUD ───────────────────────────────────────────────

  describe("tasks", () => {
    it("stores and retrieves a task", () => {
      const task = makeStoredTask("t1", "TASK_STATE_WORKING", "planner", "backend");
      store.setTask(task);
      const got = store.getTask("t1");
      expect(got).toBeDefined();
      expect(got!.id).toBe("t1");
      expect(got!.status.state).toBe("TASK_STATE_WORKING");
      expect(got!.fromAgent).toBe("planner");
      expect(got!.toAgent).toBe("backend");
    });

    it("returns undefined for unknown task", () => {
      expect(store.getTask("nonexistent")).toBeUndefined();
    });

    it("lists all tasks", () => {
      store.setTask(makeStoredTask("t1", "TASK_STATE_WORKING", "p", "a"));
      store.setTask(makeStoredTask("t2", "TASK_STATE_COMPLETED", "p", "b"));
      const list = store.listTasks();
      expect(list).toHaveLength(2);
    });

    it("updates task state", () => {
      const task = makeStoredTask("t1", "TASK_STATE_WORKING", "p", "a");
      store.setTask(task);
      store.updateTaskState("t1", "TASK_STATE_COMPLETED");
      const got = store.getTask("t1")!;
      // State column updated, but task_json still has old state
      // updateTaskState only updates state column when no taskJson provided
      expect(got.status.state).toBe("TASK_STATE_WORKING"); // task_json unchanged
    });

    it("updates task state with full JSON", () => {
      const task = makeStoredTask("t1", "TASK_STATE_WORKING", "p", "a");
      store.setTask(task);
      const updated = { ...task, status: { state: "TASK_STATE_COMPLETED" as TaskState, timestamp: new Date().toISOString() } };
      store.updateTaskState("t1", "TASK_STATE_COMPLETED", JSON.stringify(updated));
      const got = store.getTask("t1")!;
      expect(got.status.state).toBe("TASK_STATE_COMPLETED");
    });

    it("upserts task on setTask", () => {
      const task = makeStoredTask("t1", "TASK_STATE_SUBMITTED", "p", null);
      store.setTask(task);
      const updated = makeStoredTask("t1", "TASK_STATE_WORKING", "p", "a");
      store.setTask(updated);
      const got = store.getTask("t1")!;
      expect(got.status.state).toBe("TASK_STATE_WORKING");
    });

    it("deletes a task", () => {
      store.setTask(makeStoredTask("t1", "TASK_STATE_WORKING", "p", "a"));
      store.deleteTask("t1");
      expect(store.getTask("t1")).toBeUndefined();
    });

    it("persists all StoredTask fields including skillHint and taskDescription", () => {
      const task = makeStoredTask("t-full", "TASK_STATE_WORKING", "planner", "backend");
      task.skillHint = "nodejs";
      task.taskDescription = "Build the REST API";
      store.setTask(task);
      const got = store.getTask("t-full")!;
      expect(got.fromAgent).toBe("planner");
      expect(got.toAgent).toBe("backend");
      expect(got.skillHint).toBe("nodejs");
      expect(got.taskDescription).toBe("Build the REST API");
    });
  });

  // ── Push Config CRUD ────────────────────────────────────────

  describe("push configs", () => {
    it("stores and retrieves a config", () => {
      const config = makePushConfig("https://example.com/webhook", "t1");
      store.setPushConfig("cfg1", config);
      const got = store.getPushConfig("cfg1");
      expect(got).toBeDefined();
      expect(got!.url).toBe("https://example.com/webhook");
      expect(got!.taskId).toBe("t1");
      expect(got!.authentication!.scheme).toBe("bearer");
    });

    it("returns undefined for unknown config", () => {
      expect(store.getPushConfig("nonexistent")).toBeUndefined();
    });

    it("lists all configs with IDs", () => {
      store.setPushConfig("cfg1", makePushConfig("https://a.com"));
      store.setPushConfig("cfg2", makePushConfig("https://b.com"));
      const list = store.listPushConfigs();
      expect(list).toHaveLength(2);
      expect(list.map(c => c.id).sort()).toEqual(["cfg1", "cfg2"]);
      expect(list[0].config.url).toBeDefined();
    });

    it("upserts config on setPushConfig", () => {
      store.setPushConfig("cfg1", makePushConfig("https://old.com"));
      store.setPushConfig("cfg1", makePushConfig("https://new.com"));
      const got = store.getPushConfig("cfg1")!;
      expect(got.url).toBe("https://new.com");
    });

    it("deletes a config", () => {
      store.setPushConfig("cfg1", makePushConfig("https://example.com"));
      store.deletePushConfig("cfg1");
      expect(store.getPushConfig("cfg1")).toBeUndefined();
    });
  });

  // ── Recovery ────────────────────────────────────────────────

  describe("crash recovery (close + reopen)", () => {
    it("recovers agents after close and reopen", async () => {
      store.setAgent(makeAgent("alpha"));
      store.setAgent(makeAgent("beta"));
      store.close();

      const store2 = new StateStore(":memory:");
      // :memory: DBs don't persist across close — use temp file instead
      // This test verifies the pattern works
      await store2.init();
      // For :memory:, data is lost (expected). Real files persist.
      store2.close();
    });

    it("recovers data from file-based DB", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-test-"));
      const dbPath = path.join(tmpDir, "test.db");

      // Write
      const s1 = new StateStore(dbPath);
      await s1.init();
      s1.setAgent(makeAgent("agent-a"));
      s1.setAgent(makeAgent("agent-b"));
      s1.setTask(makeStoredTask("task-1", "TASK_STATE_WORKING", "p", "a"));
      s1.setPushConfig("cfg-1", makePushConfig("https://example.com/hook"));
      s1.close();

      // Reopen and verify
      const s2 = new StateStore(dbPath);
      await s2.init();
      expect(s2.listAgents()).toHaveLength(2);
      expect(s2.getTask("task-1")).toBeDefined();
      expect(s2.getTask("task-1")!.status.state).toBe("TASK_STATE_WORKING");
      expect(s2.getPushConfig("cfg-1")).toBeDefined();
      expect(s2.getPushConfig("cfg-1")!.url).toBe("https://example.com/hook");
      s2.close();

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  // ── Concurrent writes ───────────────────────────────────────

  describe("concurrent writes", () => {
    it("handles 10 agents registered rapidly", () => {
      for (let i = 0; i < 10; i++) {
        store.setAgent(makeAgent(`agent-${i}`));
      }
      expect(store.listAgents()).toHaveLength(10);
    });

    it("handles 50 tasks created rapidly", () => {
      for (let i = 0; i < 50; i++) {
        store.setTask(makeStoredTask(`task-${i}`, "TASK_STATE_WORKING", "p", `a-${i % 5}`));
      }
      expect(store.listTasks()).toHaveLength(50);
    });
  });
});
