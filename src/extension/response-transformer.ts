/**
 * Response Transformer — normalizes agent responses into structured markdown.
 *
 * karpathy-clean-code: Strategy pattern (like IsolationStrategy).
 * Config activates, not defines. Extension layer, not core.
 *
 * Two implementations:
 *   PassthroughTransformer  — default, returns text as-is
 *   StructuredTransformer   — wraps free-form text into ## Result / ## Changes / ## Notes
 *
 * The agent LLM is prompted to follow the convention.
 * The transformer normalizes if the agent didn't follow it.
 * Zero overhead: one string.includes() check.
 */

export interface ResponseTransformer {
  /** Transform raw LLM response text into final format. */
  transform(text: string): string;
}

// ── Implementations ──────────────────────────────────────────────

/** Default — returns text as-is. Zero overhead. */
export class PassthroughTransformer implements ResponseTransformer {
  transform(text: string): string {
    return text;
  }
}

/**
 * Structured — normalizes free-form text into consistent markdown.
 *
 * Convention (what we expect):
 *   ## Result   — one line with ✅/❌/⚠️ + summary
 *   ## Changes  — list of files created/modified/deleted
 *   ## Notes    — (optional) extra context
 *
 * If the response already follows convention → pass through.
 * If not → best-effort extraction and wrapping.
 */
export class StructuredTransformer implements ResponseTransformer {
  transform(text: string): string {
    // Already structured? Pass through (agent followed the prompt)
    if (text.includes("## Result") || text.includes("## Changes")) {
      return text;
    }

    // Best-effort extraction from free-form text
    const status = this.extractStatus(text);
    const files = this.extractFiles(text);
    const summary = this.extractSummary(text);

    let result = `## Result\n${status} ${summary}`;

    if (files.length > 0) {
      result += `\n\n## Changes\n${files.map(f => `- \`${f}\``).join("\n")}`;
    }

    return result;
  }

  // ── Heuristics (best-effort, no LLM needed) ────────────────────

  private extractStatus(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("error") || lower.includes("failed") || lower.includes("❌")) return "❌";
    if (lower.includes("warning") || lower.includes("partial") || lower.includes("⚠️")) return "⚠️";
    return "✅";
  }

  private extractFiles(text: string): string[] {
    // Match file paths: /path/to/file.ext or ./path/to/file.ext or path/to/file.ext
    const filePattern = /(?:\/[\w.-]+)+(?:\.[\w]+)|\.\.?\/[\w./-]+\.[\w]+/g;
    const matches = text.match(filePattern);
    if (!matches) return [];

    // Deduplicate
    return [...new Set(matches)];
  }

  private extractSummary(text: string): string {
    // Take first non-empty line, truncated to 120 chars
    const firstLine = text.split("\n").find(l => l.trim().length > 0);
    if (!firstLine) return "Task completed";

    const cleaned = firstLine
      .replace(/^#+\s*/, "")  // strip markdown headers
      .replace(/\*\*/g, "")   // strip bold
      .trim();

    return cleaned.length > 120 ? cleaned.slice(0, 117) + "..." : cleaned;
  }
}

// ── Factory ──────────────────────────────────────────────────────

export function createTransformer(format?: string): ResponseTransformer {
  if (format === "structured") return new StructuredTransformer();
  return new PassthroughTransformer();
}
