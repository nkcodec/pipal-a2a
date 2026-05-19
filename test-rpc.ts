import { SharedStateServer, SharedStateClient } from "./src/infrastructure/shared-state.js";

async function main() {
  const server = new SharedStateServer();
  const url = await server.start(19994);
  const client = new SharedStateClient(url);

  await client.register({ name: "test", description: "", supportedInterfaces: [], capabilities: {}, skills: [] });

  const taskId = await client.createTask({ from: "test", task: "hello" });
  console.log("Task:", taskId.slice(0, 8));

  // Try direct RPC
  const r = await fetch(url + "/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tasks/resolveTask",
      params: { taskId, state: "TASK_STATE_COMPLETED", result: "world" },
      id: "x",
    }),
  });
  const body = await r.json();
  console.log("Direct RPC:", JSON.stringify(body));

  await server.stop();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });