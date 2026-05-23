/**
 * ResponseCapture — Encapsulates the LLM response capture state machine.
 *
 * karpathy-clean-code: Extract implicit state into explicit class.
 * Before: 7 let variables mutated across 3 event handlers.
 * After: 1 class with clear state transitions.
 *
 * State machine:
 *   IDLE → (incoming task) → CAPTURING → (quiescence/agent_end) → POSTED → IDLE
 */

export class ResponseCapture {
  // ── State ──────────────────────────────────────────────────────
  private taskId: string | null = null;
  private capturedText = "";
  private streamedLength = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  // ── Dependencies ──────────────────────────────────────────────
  private readonly postResult: (taskId: string, result: string) => Promise<void>;
  private readonly postError: (taskId: string, error: string) => Promise<void>;
  private readonly streamChunk: (taskId: string, chunk: string) => Promise<void>;
  private readonly quiescenceMs: number;

  constructor(deps: {
    postResult: (taskId: string, result: string) => Promise<void>;
    postError: (taskId: string, error: string) => Promise<void>;
    streamChunk: (taskId: string, chunk: string) => Promise<void>;
    quiescenceMs?: number;
  }) {
    this.postResult = deps.postResult;
    this.postError = deps.postError;
    this.streamChunk = deps.streamChunk;
    this.quiescenceMs = deps.quiescenceMs ?? 15_000;
  }

  // ── Public API ────────────────────────────────────────────────

  /** Is the capture system currently tracking a task? */
  get isActive(): boolean {
    return this.taskId !== null;
  }

  /** Get current task ID (for the ask tool) */
  get currentTaskId(): string | null {
    return this.taskId;
  }

  /**
   * Begin capturing for an incoming delegated task.
   * Returns false if already busy (rejects the task).
   */
  start(taskId: string): boolean {
    if (this.taskId) return false;  // busy
    this.taskId = taskId;
    this.capturedText = "";
    this.streamedLength = 0;
    this.clearTimer();
    return true;
  }

  /**
   * Handle a message_update from pi's LLM.
   * Extracts text content, streams delta chunks, resets quiescence timer.
   */
  onMessageUpdate(event: any): void {
    if (!this.taskId) return;

    const captured = this.extractText(event);
    if (!captured) return;

    this.capturedText = captured;
    this.resetTimer();

    // Stream delta chunk
    if (captured.length > this.streamedLength) {
      const chunk = captured.slice(this.streamedLength);
      this.streamedLength = captured.length;
      this.streamChunk(this.taskId, chunk).catch(() => {});
    }
  }

  /**
   * Handle agent_end from pi.
   * Posts the captured result immediately.
   */
  async onAgentEnd(): Promise<void> {
    if (!this.taskId || !this.capturedText) return;
    await this.flush();
  }

  /**
   * Cancel capture without posting (e.g., sendUserMessage failed).
   */
  cancel(): void {
    this.reset();
  }

  // ── Private ───────────────────────────────────────────────────

  private extractText(event: any): string {
    const msg = event?.message;

    // Standard content formats
    if (msg?.content) {
      if (typeof msg.content === "string" && msg.content.length > 0) {
        return msg.content;
      }
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter((b: any) => b.type === "text" && b.text)
          .map((b: any) => b.text)
          .join("\n");
      }
    }

    // Fallback: direct content field
    if (event?.content && typeof event.content === "string") {
      return event.content;
    }

    return "";
  }

  /** Post result and reset state */
  private async flush(): Promise<void> {
    const taskId = this.taskId;
    const text = this.capturedText || "Task completed";

    this.reset();

    console.log(`[pipal-a2a] 📤 Posting result for ${taskId!.slice(0, 8)} (${text.length} chars)`);
    try {
      await this.postResult(taskId!, text);
      console.log(`[pipal-a2a] ✅ Result posted for ${taskId!.slice(0, 8)}`);
    } catch (error) {
      console.error(`[pipal-a2a] ❌ Failed to post result:`, error);
      try { await this.postError(taskId!, String(error)); } catch {}
    }
  }

  /** Reset all state to idle */
  private reset(): void {
    this.taskId = null;
    this.capturedText = "";
    this.streamedLength = 0;
    this.clearTimer();
  }

  private resetTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      console.log(`[pipal-a2a] ⏱️  Quiescence timer — posting result`);
      this.timer = null;
      this.flush();
    }, this.quiescenceMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
