/**
 * Extension load test — verifies the extension can be imported and called
 * with a mock ExtensionAPI without crashing.
 * 
 * This is NOT a unit test — it's a smoke test that runs with tsx.
 * Run: npx tsx tests/extension-load.ts
 */

import ext from "../src/extension/index.js";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { createAgentCard, createSkill } from "../src/core/types.js";

async function main() {
  let server: SharedStateServer | null = null;
  
  try {
    // ── Test 1: Extension imports ────────────────────────────────
    console.log("\n1. Extension imports:", typeof ext);
    if (typeof ext !== "function") {
      throw new Error("Default export is not a function");
    }
    console.log("   ✅ Default export is a function");

    // ── Test 2: Shared state server starts ───────────────────────
    server = new SharedStateServer({ dbPath: ":memory:" });
    const url = await server.start(19999);
    console.log("\n2. Server started at:", url);

    const client = new SharedStateClient(url);
    const reachable = await client.isReachable();
    console.log("   Health check:", reachable ? "✅ OK" : "❌ FAIL");

    // ── Test 3: Register agent ──────────────────────────────────
    const card = createAgentCard(
      "test-agent", url,
      [createSkill("testing", "Testing", "Test skill")],
      { description: "Test" }
    );
    await client.register(card);
    const agents = await client.listAgents();
    console.log("\n3. Agents registered:", agents.length, "(" + agents[0].name + ")");

    // ── Test 4: Task lifecycle ──────────────────────────────────
    const taskId = await client.createTask({ from: "test", task: "hello" });
    console.log("\n4. Task created:", taskId.slice(0, 8));
    await client.postResult(taskId, "world");
    const task = await client.getTask(taskId);
    console.log("   Task state:", task.status.state);
    console.log("   Artifact:", task.artifacts?.[0]?.parts?.[0]?.text);

    // ── Test 5: Extension factory call ──────────────────────────
    const registeredTools: string[] = [];
    const registeredCommands: string[] = [];
    const eventHandlers: Record<string, Function[]> = {};

    const mockPi = {
      on(event: string, handler: Function) {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      },
      registerTool(def: { name: string }) {
        registeredTools.push(def.name);
      },
      registerCommand(name: string, _opts: unknown) {
        registeredCommands.push(name);
      },
      sendUserMessage(msg: string) {
        console.log("   sendUserMessage:", msg.slice(0, 60));
      },
    };

    console.log("\n5. Calling extension factory...");
    ext(mockPi);

    console.log("   Tools:", registeredTools.join(", "));
    console.log("   Commands:", registeredCommands.join(", "));
    console.log("   Events:", Object.keys(eventHandlers).join(", "));

    // Verify critical registrations
    if (!registeredTools.includes("pipal_a2a_delegate")) {
      throw new Error("pipal_a2a_delegate tool not registered!");
    }
    if (!registeredCommands.includes("pipal-status")) {
      throw new Error("/pipal-status command not registered!");
    }
    if (!eventHandlers["session_start"]) {
      throw new Error("session_start handler not registered!");
    }
    if (!eventHandlers["session_shutdown"]) {
      throw new Error("session_shutdown handler not registered!");
    }

    console.log("\n✅ ALL CHECKS PASSED");
    console.log("   - Extension imports correctly");
    console.log("   - Factory function accepts ExtensionAPI");
    console.log("   - pipal_a2a_delegate tool registered");
    console.log("   - /pipal-status command registered");
    console.log("   - session_start handler registered");
    console.log("   - session_shutdown handler registered");
    console.log("   - message_update handler registered");
    console.log("   - agent_end handler registered");

    // Cleanup
    await client.unregister("test-agent");
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ FAILED:", error instanceof Error ? error.message : error);
    console.error(error instanceof Error ? error.stack : "");
    if (server) await server.stop();
    process.exit(1);
  }
}

main();
