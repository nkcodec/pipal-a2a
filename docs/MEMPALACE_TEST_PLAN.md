# MemPalace Configuration Test Plan

## Principle: Config activates, not defines (karpathy-clean-code)

---

## Scenario 1: MemPalace DISABLED (default)

**Config:**
```yaml
mempalace:
  enabled: false
```

**Expected:**
- No MemPalace reminders injected into tasks
- No MemPalace guidelines in promptSnippet/promptGuidelines
- Agents do NOT call any MemPalace tools
- Standard delegation works without MemPalace dependency

**Test:**
```bash
PIPAL_ROLE=backend pi
# Delegate task — should NOT see MemPalace reminder
```

---

## Scenario 2: MemPalace ENABLED with default wing

**Config:**
```yaml
mempalace:
  enabled: true
  wing: "wing_a2a"
  sharedRoom: "shared"
```

**Expected:**
- MemPalace reminder injected with correct wing/room
- Agent calls all 3 tools with correct params
- All calls succeed
- Diary entry created

**Test:**
```bash
PIPAL_ROLE=backend pi
# Delegate task — see MemPalace reminder, tools called, success
```

---

## Scenario 3: MemPalace ENABLED with CUSTOM wing (different project)

**Config:**
```yaml
mempalace:
  enabled: true
  wing: "wing_todo-app"
  sharedRoom: "shared"
```

**Expected:**
- Reminder uses "wing_todo-app" NOT "wing_a2a"
- Agent calls tools with wing_todo-app
- Data goes to their project wing, not our dev wing

**Test:**
```bash
# Project A (us): wing_pipal_a2a
# Project B (other dev): wing_todo-app
# Each sees only their wing in reminders
```

---

## Scenario 4: MemPalace ENABLED but MCP NOT installed

**Config:**
```yaml
mempalace:
  enabled: true
  wing: "wing_a2a"
  sharedRoom: "shared"
```

**Setup:**
- pipal-a2a running with mempalace.enabled=true
- But MemPalace MCP not in pi's MCP config

**Expected:**
- Pre-flight warning at session_start
- Agent calls tool → "Tool not found"
- Agent reports back: "MEMPALACE FAILED: mempalace_mempalace_add_drawer not found"
- Task NOT marked complete
- Planner sees failure

**Test:**
```bash
# Without mempalace MCP configured
pipal_a2a_delegate({ task: "Create file", to: "backend" })
# Backend reports: MEMPALACE FAILED: Tool "mempalace_mempalace_add_drawer" not found
```

---

## Scenario 5: MemPalace ENABLED but SERVER DOWN

**Config:**
```yaml
mempalace:
  enabled: true
  wing: "wing_a2a"
  sharedRoom: "shared"
```

**Setup:**
- MemPalace MCP installed but mempalace-mcp server not running

**Expected:**
- Agent calls tool → "Connection refused" or similar error
- Agent reports: "MEMPALACE FAILED: <error>"
- Task NOT marked complete

**Test:**
```bash
# mempalace-mcp not running
pipal_a2a_delegate({ task: "Create file", to: "backend" })
# Backend reports: MEMPALACE FAILED: <error>
```

---

## Scenario 6: Config section ABSENT (no mempalace key)

**Config:**
```yaml
sharedState: http://localhost:5000
role: backend
identity:
  name: backend
  skills: [code-generation]
```

**Expected:**
- Same as Scenario 1 (disabled by default)
- No MemPalace reminders

**Test:**
```bash
# Config has no mempalace section
# Should behave like disabled
```

---

## Scenario 7: Workflow mode with MemPalace ENABLED

**Config:**
```yaml
mempalace:
  enabled: true
  wing: "wing_a2a"
  sharedRoom: "shared"
```

**Setup:**
- workflow matches in config/team.yaml

**Expected:**
- MemPalace reminder injected into EACH step of workflow
- Each agent calls tools after their step
- Full audit trail in MemPalace

**Test:**
```bash
pipal_a2a_delegate({ task: "build todo-app", to: "backend" })
# Backend receives workflow with MemPalace reminder in each step
# Each step calls MemPalace tools
```

---

## Summary Table

| Scenario | enabled | MCP Status | Expected Behavior |
|----------|---------|-------------|-------------------|
| 1 | false | N/A | No reminders, no calls |
| 2 | true | Installed+Running | Full MemPalace flow |
| 3 | true | Installed+Running | Custom wing used |
| 4 | true | NOT installed | PRE-FLIGHT warning + runtime FAIL report |
| 5 | true | Installed but DOWN | Runtime FAIL report |
| 6 | absent | N/A | Same as Scenario 1 |
| 7 | true | Installed+Running | Workflow steps all get reminder |

---

## Implementation Status (as of v0.3.1)

| Scenario | Status | Notes |
|----------|--------|-------|
| 1 | ✅ | Works - disabled by default |
| 2 | ✅ | Works - tested with backend/reviewer/etc |
| 3 | ✅ | Config swappable - tested |
| 4 | ⚠️ | Pre-flight warning added, runtime FAIL works |
| 5 | ⚠️ | Runtime FAIL works, pre-flight can't detect |
| 6 | ✅ | Default config has no mempalace section |
| 7 | ✅ | Both workflow/delegate get reminder |
