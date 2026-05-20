# .env File Support Report — Pipal-A2A

**Date:** 2026-05-20
**Pattern:** .env file loading (zero-dependency)
**Final Test Results:** 9 test files, 98 tests passed, 0 failures
**Behavior Change:** None — all existing tests pass with identical results.

---

## Problem

The `apiKey` secret was stored in `config/pipal-a2a.yaml`, which is committed to git. This is a security concern — secrets should not be in version control.

---

## Solution

Added a zero-dependency `.env` file loader. Secrets now live in `.env` (gitignored), not in YAML config.

---

## Files Changed

### 1. `src/extension/index.ts` — added `loadEnvFile()` function

#### New function (module-level, before `loadConfig()`):

```typescript
function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — that's fine
  }
}
```

#### Called at the very start of `loadConfig()`:

```typescript
function loadConfig(): ExtensionConfig {
  loadEnvFile(); // Load .env into process.env BEFORE any config resolution
  // ... rest unchanged
```

**Why it goes first:** All subsequent env var checks (`process.env.PIPAL_API_KEY`, `process.env.PIPAL_ROLE`, etc.) need the .env values already loaded. The function only sets env vars that are NOT already set, so externally-set env vars always win.

---

### 2. `config/pipal-a2a.yaml` — removed apiKey

#### Before:
```yaml
sharedState: http://localhost:5000
apiKey: secret123

# This terminal's role — resolved from team.yaml at startup.
# The role defines name, skills, tags, and description.
# Override with PIPAL_ROLE=<role> env var.
# Legacy: use identity block instead of role for backward compat.
role: planner
```

#### After:
```yaml
sharedState: http://localhost:5000

# apiKey moved to .env (PIPAL_API_KEY) — per-project, not in git
role: planner
```

---

### 3. `.env` — NEW file

```
# Pipal-A2A Environment
# Per-project secrets — NOT committed to git
PIPAL_API_KEY=secret123
```

---

### 4. `.gitignore` — NO CHANGES needed

`.env` was already listed:
```
# Environment
.env
.env.*
```

---

## How It Works

1. `loadConfig()` calls `loadEnvFile()` as its very first action
2. `loadEnvFile()` reads `.env` from `process.cwd()`, parses `KEY=VALUE` lines
3. Only sets env vars that are NOT already set (existing env vars win)
4. The rest of `loadConfig()` works exactly as before — checking `process.env.PIPAL_API_KEY`, etc.

### Features:
- Skips comments (`#`) and blank lines
- Handles values with `=` in them (e.g., `KEY=base64==abc`)
- Strips surrounding single or double quotes
- Fails silently if no `.env` file exists

---

## Precedence Chain

```
1. Environment variable (externally set)   → always wins
2. .env file                               → loaded if env var not already set
3. pipal-a2a.yaml apiKey field             → still works (backward compat)
4. No apiKey anywhere                      → server runs open (no auth)
```

---

## Backward Compatibility

| Setup | Behavior | Status |
|--------|----------|--------|
| `.env` with `PIPAL_API_KEY=secret123` | Key loaded from .env → auth enabled | ✅ New pattern |
| No `.env`, `apiKey: secret123` in YAML | Key from YAML → auth enabled | ✅ Backward compat |
| No `.env`, no YAML apiKey | No auth → server runs open | ✅ Unchanged |
| `PIPAL_API_KEY=x` env var set + `.env` with different value | Env var wins (not overridden) | ✅ Correct |
| `PIPAL_API_KEY=x` env var + `.env` + YAML apiKey | Env var wins | ✅ Correct |

---

## Test Results

```
Test Files  9 passed (9)
     Tests  98 passed (98)
  Duration  7.51s
```

---

## Files NOT Modified

- `config/team.yaml` — NO changes ✅
- `src/core/` — Frozen core, untouched ✅
- `src/sdk/` — No changes needed ✅
- `.gitignore` — Already had `.env` ✅
- `src/infrastructure/shared-state.ts` — No changes needed ✅
- All test files — No changes needed ✅
- No new npm packages installed ✅

---

## Lines Changed

| File | Lines Changed |
|------|---------------|
| `src/extension/index.ts` | +25 (new function + call) |
| `config/pipal-a2a.yaml` | -5 (removed apiKey, trimmed comments) |
| `.env` | NEW (3 lines) |
