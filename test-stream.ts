import { SharedStateServer, SharedStateClient } from "./src/infrastructure/shared-state.js";

async function main() {
  const server = new SharedStateServer();
  const url = await server.start(19993);
  const client = new SharedStateClient(url);

  await client.register({ name: "test", description: "", supportedInterfaces: [], capabilities: {}, skills: [] });

  const taskId = await client.createTask({ from: "test", task: "streaming test" });
  console.log("Task:", taskId.slice(0, 8));

  // Check if subscribeToTask exists
  if (typeof (client as any).subscribeToTask === "function") {
    console.log("subscribeToTask method EXISTS");
    const unsub = (client as any).subscribeToTask(taskId, (event: string, data: any) => {
      console.log(`Event: ${event}`, JSON.stringify(data).slice(0, 100));
      if (event === "task_completed" || event === "task_failed") {
        unsub();
        server.stop().then(() => process.exit(0));
      }
    });

    // Post result
    await client.postResult(taskId, "streaming result!");
  } else {
    console.log("subscribeToTask method NOT found");
    await server.stop();
    process.exit(0);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });