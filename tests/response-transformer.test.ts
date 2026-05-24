/**
 * Tests for Response Transformer
 *
 * StructuredTransformer normalizes free-form agent responses.
 * PassthroughTransformer returns text as-is.
 * createTransformer factory picks based on config.
 */

import { describe, it, expect } from "vitest";
import {
  PassthroughTransformer,
  StructuredTransformer,
  createTransformer,
} from "../src/extension/response-transformer.js";

// ── PassthroughTransformer ──────────────────────────────────────

describe("PassthroughTransformer", () => {
  it("returns text as-is", () => {
    const t = new PassthroughTransformer();
    expect(t.transform("hello world")).toBe("hello world");
  });

  it("returns empty string as-is", () => {
    const t = new PassthroughTransformer();
    expect(t.transform("")).toBe("");
  });

  it("returns structured text as-is", () => {
    const t = new PassthroughTransformer();
    const input = "## Result\n✅ Done\n\n## Changes\n- `foo.ts`";
    expect(t.transform(input)).toBe(input);
  });
});

// ── StructuredTransformer ───────────────────────────────────────

describe("StructuredTransformer", () => {
  it("passes through already-structured responses", () => {
    const t = new StructuredTransformer();
    const input = "## Result\n✅ Done\n\n## Changes\n- `foo.ts`";
    expect(t.transform(input)).toBe(input);
  });

  it("wraps free-form success text", () => {
    const t = new StructuredTransformer();
    const result = t.transform("Created the file successfully.");
    expect(result).toContain("## Result");
    expect(result).toContain("✅");
    expect(result).toContain("Created the file successfully.");
  });

  it("extracts file paths from response", () => {
    const t = new StructuredTransformer();
    const result = t.transform("Created /tmp/test/hello.txt with content.");
    expect(result).toContain("## Changes");
    expect(result).toContain("`/tmp/test/hello.txt`");
  });

  it("detects error status", () => {
    const t = new StructuredTransformer();
    const result = t.transform("Error: file not found. Failed to create.");
    expect(result).toContain("❌");
  });

  it("detects warning status", () => {
    const t = new StructuredTransformer();
    const result = t.transform("Warning: partial completion. Some files skipped.");
    expect(result).toContain("⚠️");
  });

  it("deduplicates file paths", () => {
    const t = new StructuredTransformer();
    const result = t.transform("Created /tmp/a.txt and /tmp/a.txt again.");
    // Should only appear once in Changes
    const changesSection = result.split("## Changes")[1] || "";
    const matches = changesSection.match(/\/tmp\/a\.txt/g) || [];
    expect(matches.length).toBe(1);
  });

  it("truncates long summary", () => {
    const t = new StructuredTransformer();
    const longText = "A".repeat(200);
    const result = t.transform(longText);
    const resultLine = result.split("\n")[1] || "";
    expect(resultLine.length).toBeLessThanOrEqual(123); // ✅ + space + 120 chars
  });

  it("handles empty text", () => {
    const t = new StructuredTransformer();
    const result = t.transform("");
    expect(result).toContain("## Result");
    expect(result).toContain("Task completed");
  });

  it("strips markdown headers from summary", () => {
    const t = new StructuredTransformer();
    const result = t.transform("## Summary of what I did");
    expect(result).not.toContain("## Summary of what I did");
    expect(result).toContain("Summary of what I did");
  });
});

// ── Factory ─────────────────────────────────────────────────────

describe("createTransformer", () => {
  it("returns PassthroughTransformer by default", () => {
    const t = createTransformer();
    expect(t).toBeInstanceOf(PassthroughTransformer);
  });

  it("returns PassthroughTransformer for raw", () => {
    const t = createTransformer("raw");
    expect(t).toBeInstanceOf(PassthroughTransformer);
  });

  it("returns StructuredTransformer for structured", () => {
    const t = createTransformer("structured");
    expect(t).toBeInstanceOf(StructuredTransformer);
  });

  it("returns PassthroughTransformer for unknown value", () => {
    const t = createTransformer("unknown");
    expect(t).toBeInstanceOf(PassthroughTransformer);
  });
});
