# Role Refactor Report — Pipal-A2A

**Date:** 2026-05-20
**Pattern:** PIPAL_ROLE Reference Pattern
**Final Test Results:** 9 test files, 98 tests passed, 0 failures
**Behavior Change:** None — all existing tests pass with identical results.

---

## Problem

Identity data (name, skills, tags, description) was duplicated in 3 places:
1. `config/pipal-a2a.yaml` → identity block
2. `config/team.yaml` → same data + tags
3. Env vars → PIPAL_NAME, PIPAL_SKILLS, PIPAL_TAGS

This caused a real bug: the planner agent had NO tags because `pipal-a2a.yaml` didn't set them, but `team.yaml` defined `tags: [plan, architecture, design]`. SmartRouter routes by tags from team.yaml, but AgentCard had no tags → routing was broken.

---

## Solution: Role Reference Pattern

`team.yaml` is now the **single source of truth** for identity. `pipal-a2a.yaml` just references a role name.

---

## Files Changed

### 1. `config/pipal-a2a.yaml` — simplified to role reference

#### Before:
```yaml
# This terminal's identity in the agent network
identity:
  name: planner
  description: "Plans tasks and delegates to specialized workers"
  skills:
    - planning
    - delegation
```

#### After:
```yaml
# This terminal's role — resolved from team.yaml at startup.
# The role defines name, skills, tags, and description.
# Override with PIPAL_ROLE=<role> env var.
# Legacy: use identity block instead of role for backward compat.
role: planner
```

---

### 2. `src/extension/index.ts` — role resolution in loadConfig()

#### Change A: Added `role` field to interface

```typescript
interface ExtensionConfig {
  sharedState: string;
  role?: string;          // ← NEW
  identity: {
    name: string;
    description?: string;
    skills: string[];
    tags: string[];
  };
  apiKey?: string;
}
```

#### Change B: Added role resolution between config file load and env var overrides

```typescript
// PIPAL_ROLE env var overrides config file role
if (process.env.PIPAL_ROLE) {
  config.role = process.env.PIPAL_ROLE;
}

// Resolve role from team.yaml — sets identity fields (name, skills, tags, description)
if (config.role) {
  const roles = loadTeamRoles();
  const role = roles.get(config.role);
  if (role) {
    config.identity.name = role.name;
    config.identity.skills = role.skills;
    config.identity.tags = role.tags || [];
    config.identity.description = role.description;
  } else {
    console.warn(`[pipal-a2a] Role "${config.role}" not found in team.yaml`);
  }
}

// Environment variables override individual identity fields (backward compat)
if (process.env.PIPAL_NAME) config.identity.name = process.env.PIPAL_NAME;
// ... PIPAL_SKILLS, PIPAL_TAGS, PIPAL_DESCRIPTION, etc.
```

#### Change C: `/pipal-role` command now also sets `config.role`

```typescript
// Update config
config.role = roleName;           // ← NEW: keeps config consistent
config.identity.name = role.name;
config.identity.description = role.description;
config.identity.skills = role.skills;
config.identity.tags = role.tags || [];
```

---

### 3. `config/team.yaml` — NO CHANGES

team.yaml already has all the data. It stays as-is.

---

## Precedence Chain

```
1. config/pipal-a2a.yaml: role: planner     → resolves from team.yaml
2. PIPAL_ROLE=backend env var               → overrides file, resolves from team.yaml
3. PIPAL_NAME/PIPAL_SKILLS/PIPAL_TAGS env   → override individual fields (backward compat)
4. pipal-a2a.yaml identity block (legacy)   → still works if no role specified
```

How it works:
- `loadConfig()` reads the YAML file
- If `PIPAL_ROLE` env var is set, it overrides `config.role`
- If `config.role` is set, `loadTeamRoles()` resolves it from team.yaml → populates identity
- Then individual env vars (PIPAL_NAME, PIPAL_SKILLS, PIPAL_TAGS) can still override specific fields
- If neither `role` nor `identity.name` is set, auto-generated name is used (unchanged behavior)

---

## Backward Compatibility

| Setup | Behavior | Status |
|--------|----------|--------|
| `role: planner` in pipal-a2a.yaml | Resolves planner from team.yaml including tags | ✅ New pattern |
| `PIPAL_ROLE=backend` env var | Resolves backend from team.yaml | ✅ New pattern |
| Old-style `identity:` block, no `role:` | Uses identity block as before | ✅ Backward compat |
| No role, no identity, no env vars | Auto-generated name | ✅ Unchanged |
| `identity:` block + `PIPAL_NAME` env | Env var overrides identity name | ✅ Unchanged |
| `role: planner` + `PIPAL_TAGS=custom` | Role resolves first, then env var overrides tags | ✅ Works |

---

## Test Results

```
Test Files  9 passed (9)
     Tests  98 passed (98)
  Duration  7.09s
```

All existing tests pass without modification. The refactor is purely additive:
- New `role` field on `ExtensionConfig` (optional)
- New `PIPAL_ROLE` env var handling
- Role resolution logic runs before existing env var overrides
- `/pipal-role` command gains one line (`config.role = roleName`)

---

## Files NOT Modified

- `src/core/types.ts` — Frozen core, untouched ✅
- `src/sdk/index.ts` — No changes needed ✅
- `src/application/registry.ts` — No changes needed ✅
- `src/application/router.ts` — No changes needed ✅
- `src/builtin/skill-matcher.ts` — No changes needed ✅
- `src/builtin/smart-router.ts` — No changes needed ✅
- `src/cli/index.ts` — No changes needed ✅
- `config/team.yaml` — No changes needed ✅
- All test files — No changes needed ✅

---

## Lines Changed

| File | Lines Changed |
|------|---------------|
| `config/pipal-a2a.yaml` | 7 (identity block → role reference) |
| `src/extension/index.ts` | ~25 (interface + role resolution + pipal-role command) |
