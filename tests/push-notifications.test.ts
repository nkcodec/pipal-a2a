/**
 * v0.1.6 — Push Notification tests
 *
 * Google A2A spec §3.1.7-3.1.10.
 * CRUD for push notification configs + webhook delivery on task completion.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import type { PushNotificationConfig } from "../src/core/types.js";

const PORT = 18006;

let server: SharedStateServer;
let client: SharedStateClient;
let baseUrl: string;

beforeAll(async () => {
  server = new SharedStateServer({ dbPath: ":memory:" });
  baseUrl = await server.start(PORT);
  client = new SharedStateClient(baseUrl);
});

afterAll(async () => {
  await server.stop();
});

describe("Push Notification Configs (v0.1.6)", () => {
  it("creates a push config", async () => {
    const config: PushNotificationConfig = {
      url: "http://localhost:9999/webhook",
    };
    const result = await client.createPushConfig(config);
    expect(result.id).toBeTruthy();
    expect(result.url).toBe("http://localhost:9999/webhook");
  });

  it("creates a push config with taskId filter", async () => {
    const config: PushNotificationConfig = {
      taskId: "task-123",
      url: "http://localhost:9999/webhook/task",
    };
    const result = await client.createPushConfig(config);
    expect(result.taskId).toBe("task-123");
  });

  it("lists push configs", async () => {
    const configs = await client.listPushConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes a push config", async () => {
    const config = await client.createPushConfig({ url: "http://localhost:9999/to-delete" });
    await client.deletePushConfig(config.id);

    const configs = await client.listPushConfigs();
    expect(configs.find((c) => c.id === config.id)).toBeUndefined();
  });

  it("rejects config without url", async () => {
    try {
      await client.createPushConfig({ url: "" });
      // If it didn't throw, check it was rejected
      const configs = await client.listPushConfigs();
      const empty = configs.find((c) => c.url === "");
      expect(empty).toBeUndefined();
    } catch (e) {
      expect((e as Error).message).toContain("400");
    }
  });
});

describe("Push webhook delivery (v0.1.6)", () => {
  it("webhook fires on task completion", async () => {
    // Track webhook calls
    const webhookCalls: unknown[] = [];

    // Create a simple webhook server
    const { createServer } = await import("http");
    const webhookServer = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        webhookCalls.push(JSON.parse(body));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });

    await new Promise<void>((resolve) => webhookServer.listen(18007, resolve));

    try {
      // Register push config pointing to webhook
      await client.createPushConfig({ url: "http://localhost:18007/webhook" });

      // Register an agent
      await client.register({
        name: "push-test-agent",
        description: "",
        supportedInterfaces: [],
        capabilities: { streaming: true },
        skills: [],
      });

      // Create and complete a task
      const taskId = await client.createTask({
        from: "test",
        to: "push-test-agent",
        task: "test push webhook",
      });

      await client.postResult(taskId, "task done");

      // Wait for webhook to fire
      await new Promise((r) => setTimeout(r, 500));

      expect(webhookCalls.length).toBeGreaterThanOrEqual(1);
      const payload = webhookCalls[0] as any;
      expect(payload.taskId).toBe(taskId);
      expect(payload.state).toBe("TASK_STATE_COMPLETED");
      expect(payload.result).toBe("task done");
    } finally {
      webhookServer.close();
    }
  });
});
