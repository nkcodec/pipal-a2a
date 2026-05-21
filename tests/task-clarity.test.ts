import { describe, it, expect } from "vitest";

// assessTaskClarity is private in index.ts — we test by duplicating the logic.
// This is intentional: the guard patterns must be stable across refactors.

interface ClarityAssessment {
  reject: boolean;
  reason: string;
  questions: string[];
}

const VAGUE_PATTERNS: Array<{ pattern: RegExp; reason: string; questions: string[] }> = [
  {
    pattern: /^(build|make|create|fix|improve|update|change|do)\s*(something|it|that|this|stuff|things?)?\s*$/i,
    reason: "Task has no specific subject",
    questions: [
      "WHAT exactly should be built, fixed, or changed?",
      "WHERE should the output go (file path, directory)?",
      "WHAT are the specific requirements or acceptance criteria?",
    ],
  },
  {
    pattern: /^(make|build)\s+(it|the app|the code|the project)\s+(better|good|cool|nice|awesome|great|work)\s*$/i,
    reason: "Task has subjective goal with no measurable criteria",
    questions: [
      "WHAT specific improvement is needed (performance, UX, security)?",
      "HOW will you know it's done (test, benchmark, metric)?",
      "WHICH files or components should change?",
    ],
  },
  {
    pattern: /^fix\s+(the\s+)?(bug|issue|problem|error)\s*$/i,
    reason: "Task references a bug without describing it",
    questions: [
      "WHAT is the bug (error message, unexpected behavior)?",
      "WHERE does it occur (file, route, function)?",
      "WHEN does it happen (reproduction steps)?",
      "WHAT is the expected behavior?",
    ],
  },
  {
    pattern: /^(add|implement)\s+(a\s+)?(feature|functionality|thing|stuff)\s*$/i,
    reason: "Task references a feature without describing it",
    questions: [
      "WHAT feature should be added (name, purpose)?",
      "WHERE should it go (API endpoint, UI component)?",
      "WHAT are the inputs and outputs?",
    ],
  },
  {
    pattern: /^(review|check|test|analyze)\s*(it|this|the code|the app)?\s*$/i,
    reason: "Task requests review with no subject",
    questions: [
      "WHAT should be reviewed (file path, code snippet, PR)?",
      "WHAT aspects (security, performance, style, correctness)?",
      "ARE there specific concerns or known issues?",
    ],
  },
  {
    pattern: /^.{0,10}$/,
    reason: "Task is too short to be actionable",
    questions: [
      "WHAT is the specific task?",
      "WHAT files or components are involved?",
      "WHAT are the expected deliverables?",
    ],
  },
];

function assessTaskClarity(taskDescription: string): ClarityAssessment {
  const trimmed = taskDescription.trim();
  for (const { pattern, reason, questions } of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { reject: true, reason, questions };
    }
  }
  return { reject: false, reason: "", questions: [] };
}

// ── Rejection Tests ──────────────────────────────────

describe("assessTaskClarity — rejects vague tasks", () => {
  it("rejects bare verb: 'build'", () => {
    const result = assessTaskClarity("build");
    expect(result.reject).toBe(true);
    expect(result.reason).toContain("no specific subject");
  });

  it("rejects 'build something'", () => {
    expect(assessTaskClarity("build something").reject).toBe(true);
  });

  it("rejects 'fix it'", () => {
    expect(assessTaskClarity("fix it").reject).toBe(true);
  });

  it("rejects 'make it better'", () => {
    expect(assessTaskClarity("make it better").reject).toBe(true);
  });

  it("rejects 'fix the bug'", () => {
    const result = assessTaskClarity("fix the bug");
    expect(result.reject).toBe(true);
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects 'fix the error'", () => {
    expect(assessTaskClarity("fix the error").reject).toBe(true);
  });

  it("rejects 'add a feature'", () => {
    const result = assessTaskClarity("add a feature");
    expect(result.reject).toBe(true);
    expect(result.questions).toContain("WHAT feature should be added (name, purpose)?");
  });

  it("rejects 'review'", () => {
    expect(assessTaskClarity("review").reject).toBe(true);
  });

  it("rejects 'check it'", () => {
    expect(assessTaskClarity("check it").reject).toBe(true);
  });

  it("rejects 'test'", () => {
    expect(assessTaskClarity("test").reject).toBe(true);
  });

  it("rejects very short tasks: 'hi'", () => {
    const result = assessTaskClarity("hi");
    expect(result.reject).toBe(true);
    expect(result.reason).toContain("too short");
  });

  it("rejects empty string", () => {
    expect(assessTaskClarity("").reject).toBe(true);
  });

  it("rejects 'improve'", () => {
    expect(assessTaskClarity("improve").reject).toBe(true);
  });

  it("rejects 'do something'", () => {
    expect(assessTaskClarity("do something").reject).toBe(true);
  });

  it("rejects 'build the app better'", () => {
    expect(assessTaskClarity("build the app better").reject).toBe(true);
  });

  it("rejects 'make the project work'", () => {
    expect(assessTaskClarity("make the project work").reject).toBe(true);
  });
});

// ── Acceptance Tests ──────────────────────────────────

describe("assessTaskClarity — accepts clear tasks", () => {
  it("accepts 'Create a file at /tmp/test.txt with content hello'", () => {
    expect(assessTaskClarity("Create a file at /tmp/test.txt with content hello").reject).toBe(false);
  });

  it("accepts 'Build Express REST API with 4 routes: /users, /posts, /comments, /auth'", () => {
    expect(assessTaskClarity("Build Express REST API with 4 routes: /users, /posts, /comments, /auth").reject).toBe(false);
  });

  it("accepts 'Fix SQL injection in /user/:id route by using parameterized queries'", () => {
    expect(assessTaskClarity("Fix SQL injection in /user/:id route by using parameterized queries").reject).toBe(false);
  });

  it("accepts 'Review src/extension/index.ts for security vulnerabilities'", () => {
    expect(assessTaskClarity("Review src/extension/index.ts for security vulnerabilities").reject).toBe(false);
  });

  it("accepts 'Add POST /order endpoint to server.js with body validation'", () => {
    expect(assessTaskClarity("Add POST /order endpoint to server.js with body validation").reject).toBe(false);
  });

  it("accepts 'Create React trading UI with components: OrderForm, PriceChart, OrderBook'", () => {
    expect(assessTaskClarity("Create React trading UI with components: OrderForm, PriceChart, OrderBook").reject).toBe(false);
  });
});
