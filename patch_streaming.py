"""Patch shared-state.ts to add streaming support"""
with open('src/infrastructure/shared-state.ts', 'r') as f:
    c = f.read()

# Find the end of waitForResult method
marker = """  async waitForResult(
    taskId: string,
    options?: { timeout?: number }
  ): Promise<StoredTask> {
    const timeout = options?.timeout ?? 120_000;
    const interval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const task = await this.getTask(taskId);
      if (
        task.status.state === "TASK_STATE_COMPLETED" ||
        task.status.state === "TASK_STATE_FAILED"
      ) {
        return task;
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
  }
}"""

streaming = """  async waitForResult(
    taskId: string,
    options?: { timeout?: number }
  ): Promise<StoredTask> {
    const timeout = options?.timeout ?? 120_000;
    const interval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const task = await this.getTask(taskId);
      if (
        task.status.state === "TASK_STATE_COMPLETED" ||
        task.status.state === "TASK_STATE_FAILED"
      ) {
        return task;
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
  }

  /**
   * Subscribe to streaming updates for a task.
   * Calls onUpdate for each event received (task_update, task_completed, task_failed).
   * Returns unsubscribe function.
   */
  subscribeToTask(
    taskId: string,
    onUpdate: (data: {
      taskId: string;
      status?: { state: string; timestamp: string };
      result?: unknown;
      error?: string;
    }) => void,
  ): () => void {
    const controller = new AbortController();
    let closed = false;

    const connect = async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/tasks/${taskId}/streams?clientId=${crypto.randomUUID()}`,
          { signal: controller.signal },
        );
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              try {
                onUpdate(JSON.parse(line.slice(6)));
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch {
        // connection closed
      }
    };

    connect();
    return () => {
      closed = true;
      controller.abort();
    };
  }
}"""

if marker in c:
    c = c.replace(marker, streaming)
    print("Added subscribeToTask streaming method")
else:
    print("NOT FOUND - trying alternative")
    idx = c.find("throw new Error(`Task ${taskId} timed out")
    print(f"Found at idx {idx}: {repr(c[idx:idx+100])}")

with open('src/infrastructure/shared-state.ts', 'w') as f:
    f.write(c)