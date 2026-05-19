with open('src/infrastructure/shared-state.ts', 'r') as f:
    c = f.read()

if 'subscribeToTask' in c:
    print("subscribeToTask already exists")
else:
    c = c + '''

  subscribeToTask(
    taskId: string,
    onEvent: (event: string, data: unknown) => void,
  ): () => void {
    const controller = new AbortController();
    let currentEvent = "message";

    fetch(this.baseUrl + "/tasks/" + taskId + "/streams?clientId=" + crypto.randomUUID(), { signal: controller.signal })
      .then((response) => {
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        function process() {
          reader.read().then(({ done, value }: { done: boolean; value: Uint8Array }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                try { onEvent(currentEvent, JSON.parse(line.slice(6))); } catch { onEvent(currentEvent, line.slice(6)); }
              }
            }
            if (!controller.signal.aborted) process();
          });
        }
        process();
      })
      .catch(() => {});

    return () => { controller.abort(); };
  }
'''

    with open('src/infrastructure/shared-state.ts', 'w') as f:
        f.write(c)
    print("Done. Last 5 lines:")
    lines = c.split('\n')
    for l in lines[-5:]:
        print(repr(l))