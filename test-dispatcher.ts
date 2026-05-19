// Minimal test for the JSON-RPC dispatcher
import { JsonRpcDispatcher } from "./src/infrastructure/jsonrpc.js";

async function main() {
  const dispatcher = new JsonRpcDispatcher();

  // Register a simple test method
  dispatcher.register("test/hello", async (params) => {
    console.log("test/hello called with:", params);
    return { greeting: "hello", params };
  });

  // Register a method that throws
  dispatcher.register("test/error", async () => {
    throw new Error("test error");
  });

  // Test 1: valid request
  const req1 = { jsonrpc: "2.0", method: "test/hello", params: { name: "world" }, id: 1 };
  console.log("\nTest 1: valid request");
  const resp1 = await dispatcher.dispatch(req1);
  console.log("Response:", JSON.stringify(resp1));

  // Test 2: invalid jsonrpc
  const req2 = { jsonrpc: "1.0", method: "test/hello", params: {}, id: 2 };
  console.log("\nTest 2: invalid jsonrpc");
  const resp2 = await dispatcher.dispatch(req2);
  console.log("Response:", JSON.stringify(resp2));

  // Test 3: method not found
  const req3 = { jsonrpc: "2.0", method: "test/nonexistent", params: {}, id: 3 };
  console.log("\nTest 3: method not found");
  const resp3 = await dispatcher.dispatch(req3);
  console.log("Response:", JSON.stringify(resp3));

  // Test 4: method that throws
  const req4 = { jsonrpc: "2.0", method: "test/error", params: {}, id: 4 };
  console.log("\nTest 4: method that throws");
  const resp4 = await dispatcher.dispatch(req4);
  console.log("Response:", JSON.stringify(resp4));

  // Test 5: resolveTask
  const req5 = { jsonrpc: "2.0", method: "tasks/resolveTask", params: { taskId: "fake", state: "TASK_STATE_FAILED", error: "test" }, id: 5 };
  console.log("\nTest 5: tasks/resolveTask (not registered)");
  const resp5 = await dispatcher.dispatch(req5);
  console.log("Response:", JSON.stringify(resp5));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });