# MemPalace Integration Design — Wing Structure

## Wing: `wing_a2a`

The pipal-a2a memory palace. All agents share this wing.
Each room is a category of knowledge agents need.

---

## Rooms (Categories)

### 1. `projects` — What agents built
**Purpose:** Project deliverables, file trees, status

| Drawer Type | Example |
|-------------|---------|
| Project summary | `btc-trading: Node.js/Express trading API + React UI` |
| File manifest | `btc-trading/backend/server.js, routes/, models/` |
| Build status | `btc-trading/backend: ✅ running on port 3000` |
| Dependencies | `btc-trading/backend: express ^4.18, cors, uuid` |

**When written:** PostHook after each workflow step completes  
**When queried:** PreHook before starting a new step

```
PROJ: btc-trading | STATUS: complete | FILES: 22 | AGENTS: backend+security+data+frontend+reviewer
PROJ: todo-app | STATUS: partial | FILES: 8 | AGENTS: backend+frontend
```

---

### 2. `decisions` — Architecture & design decisions
**Purpose:** Why things were decided (ADRs - Architecture Decision Records)

| Drawer Type | Example |
|-------------|---------|
| ADR | `ADR-001: In-memory storage over database for demo` |
| Tech choice | `Express over Fastify for backend (simpler ecosystem)` |
| Workflow design | `Working_dir enforced via PreHook, not agent instructions` |
| Config choice | `PIPAL_ROLE > PIPAL_NAME for identity resolution` |

**When written:** When agent makes a non-obvious choice  
**When queried:** Before making similar decisions

```
DEC: ADR-001 | PROJ: btc-trading | CHOICE: in-memory over DB | WHY: demo scope | ★★★
DEC: ADR-002 | PROJ: pipal-a2a | CHOICE: PIPAL_ROLE pattern | WHY: DRY identity | ★★★★★
DEC: ADR-003 | PROJ: pipal-a2a | CHOICE: PreHook enforcement | WHY: agents ignore text | ★★★★
```

---

### 3. `bugs` — Bugs found and how they were fixed
**Purpose:** Error → diagnosis → fix history

| Drawer Type | Example |
|-------------|---------|
| Bug report | `Backend worked in wrong directory (pipal-a2a/ instead of btc-trading/)` |
| Root cause | `Agent ignored text instruction to change directory` |
| Fix applied | `PreHook creates directory before delegation` |
| Regression test | `Test: workflow creates working_dir before delegating` |

**When written:** When bug is discovered and fixed  
**When queried:** Before starting similar work (avoid repeat mistakes)

```
BUG: working-dir-ignored | SEV: high | ROOT: agent ignored text | FIX: mkdir before delegate | VERIFIED: 98 tests pass
BUG: auto-port-override | SEV: medium | ROOT: YAML not propagated to env | FIX: sharedState→process.env | VERIFIED: 98 tests pass
BUG: sse-injection | SEV: critical | ROOT: clientId interpolated in HTML | FIX: JSON.stringify | VERIFIED: 98 tests pass
```

---

### 4. `security` — Vulnerabilities and hardening
**Purpose:** Security findings, severity, remediation

| Drawer Type | Example |
|-------------|---------|
| Finding | `HIGH: Order ID parsing without validation` |
| Remediation | `Add NaN check + range validation` |
| Pattern | `Always whitelist exchange parameter against allowed values` |
| Checklist | `Input validation checklist for new endpoints` |

**When written:** Security agent completes audit  
**When queried:** Before building new endpoints

```
SEC: btc-trading order-id | SEV: high | TYPE: injection | FIX: parseInt + NaN check
SEC: btc-trading orderbook | SEV: high | TYPE: ssrf | FIX: whitelist exchanges
SEC: pipal-a2a yaml-parse | SEV: critical | TYPE: rce | FIX: DEFAULT_SCHEMA
SEC: pipal-a2a sse-inject | SEV: critical | TYPE: xss | FIX: JSON.stringify
```

---

### 5. `workflows` — Workflow definitions and results
**Purpose:** What workflows exist, what they produced

| Drawer Type | Example |
|-------------|---------|
| Definition | `btc-trading: 5 steps, working_dir: btc-trading` |
| Execution log | `btc-trading run 2026-05-21: 4/5 steps completed` |
| Step result | `backend: ✅ Created 8 files in btc-trading/backend/` |
| Skipped agents | `security: skipped (not online)` |

**When written:** PreHook starts workflow, PostHook stores results  
**When queried:** Before running similar workflow

```
WF: btc-trading | STEPS: 5 | COMPLETED: 5 | DIR: btc-trading/ | DATE: 2026-05-21
WF: btc-trading | STEP: backend | STATUS: ✅ | FILES: 8 | DURATION: 45s
WF: btc-trading | STEP: security | STATUS: ✅ | FINDINGS: 7 | REPORT: security-report.md
WF: btc-trading | STEP: frontend | STATUS: ✅ | FILES: 6 | DURATION: 30s
```

---

### 6. `agents` — Agent capabilities and performance
**Purpose:** What each agent can do, how it performed

| Drawer Type | Example |
|-------------|---------|
| Capability | `backend: Node.js, Express, API design` |
| Performance | `backend: avg 45s per task, 100% completion rate` |
| Preference | `backend: prefers specific task descriptions over vague ones` |
| Behavior | `backend: asks for clarification on vague tasks` |

**When written:** After each task completion  
**When queried:** Before delegating to an agent

```
AGENT: backend | SKILLS: node.js,express,api | SPEED: 45s avg | RELIABILITY: high
AGENT: security | SKILLS: audit,hardening | SPEED: 30s avg | RELIABILITY: high
AGENT: frontend | SKILLS: react,css,ui | SPEED: 30s avg | RELIABILITY: high
AGENT: backend | LESSON: needs specific task requirements, ignores vague instructions
```

---

### 7. `patterns` — Code patterns and best practices
**Purpose:** Reusable patterns across projects

| Drawer Type | Example |
|-------------|---------|
| Code pattern | `Express route with validation middleware` |
| Config pattern | `PIPAL_ROLE for DRY identity resolution` |
| Workflow pattern | `working_dir for project isolation` |
| Security pattern | `Whitelist validation for external parameters` |

**When written:** When a reusable pattern emerges  
**When queried:** Before starting new work

```
PAT: express-validation | DESC: validate input before processing | SCOPE: all routes
PAT: pipal-role | DESC: team.yaml as single source of truth | SCOPE: config
PAT: working-dir | DESC: mkdir before delegate for isolation | SCOPE: workflows
PAT: whitelist-param | DESC: check against allowed values | SCOPE: security
```

---

### 8. `lessons` — What worked, what didn't
**Purpose:** Session learnings, improvement ideas

| Drawer Type | Example |
|-------------|---------|
| What worked | `Specific task requirements → agent builds correctly` |
| What didn't | `Vague "build btc-trading" → agent asks questions` |
| Improvement | `Add ESM/CJS compatibility check for generated code` |
| Tip | `Use .cjs extension when package.json has type:module` |

**When written:** End of session, or when insight discovered  
**When queried:** Start of new session

```
LESSON: vague-tasks-fail | PROJ: btc-trading | INSIGHT: agents need specific requirements | IMPORTANCE: ★★★★★
LESSON: cjs-vs-esm | PROJ: btc-trading | INSIGHT: parent package.json type affects child scripts | IMPORTANCE: ★★★
LESSON: text-instructions-ignored | PROJ: pipal-a2a | INSIGHT: enforce working_dir via code not text | IMPORTANCE: ★★★★
```

---

## Drawer Templates

Each drawer is a full markdown document. Below are the templates agents will write.

### projects Drawer Template

```markdown
# Project: {project_name}

## Overview
- **Status:** complete | partial | failed
- **Working Dir:** {working_dir}/
- **Created:** {date}
- **Agents Used:** {agent_list}

## File Tree
```
{working_dir}/
├── backend/
│   ├── server.js
│   ├── routes/
│   └── models/
├── frontend/
│   └── src/
└── security-report.md
```

## Dependencies
- backend: express ^4.18, cors, uuid
- frontend: react ^18, react-dom

## Running
- Backend: `cd {working_dir}/backend && npm start` (port 3000)
- Frontend: `cd {working_dir}/frontend && npm start` (port 3002)

## Notes
{any additional notes}
```

### decisions Drawer Template

```markdown
# ADR-{number}: {title}

## Status
Proposed | Accepted | Deprecated

## Context
{What is the issue that we're seeing that is motivating this decision?}

## Decision
{What is the change that we're proposing?}

## Why
{Why this choice over alternatives?}

## Alternatives Considered
1. {alt_1} — Rejected because {reason}
2. {alt_2} — Rejected because {reason}

## Consequences
- Positive: {benefit}
- Negative: {tradeoff}

## References
- Related: ADR-{xxx}
- Commit: {commit_hash}

---
*Created: {date} by {agent}*
```

### bugs Drawer Template

```markdown
# Bug: {short_title}

## Severity
critical | high | medium | low

## Symptom
{What went wrong? What did the user see?}

## Reproduction
1. {step_1}
2. {step_2}
3. Expected: {expected}
4. Actual: {actual}

## Root Cause
{What was the underlying issue?}

## Fix
{What change was made?}
- File: {file_path}
- Change: {description}
- Commit: {commit_hash}

## Verification
- [x] Tests pass: {test_count}
- [x] Manual test: {description}
- [x] No regression

## Lesson Learned
{How to prevent this in the future}

---
*Fixed: {date} in commit {hash}*
```

### security Drawer Template

```markdown
# Security Finding: {short_title}

## Severity
critical | high | medium | low

## Category
injection | ssrf | xss | validation | auth | rce

## Location
- **File:** {file_path}
- **Line:** {line_number}
- **Function:** {function_name}

## Vulnerable Code
```{language}
{vulnerable_code}
```

## Issue
{Why is this code vulnerable?}

## Exploit Scenario
{How could an attacker exploit this?}

## Fix
```{language}
{fixed_code}
```

## Prevention Pattern
{General pattern to prevent this class of vulnerability}

## References
- OWASP: {category}
- CWE: {number}

---
*Found: {date} by {agent}*
```

### workflows Drawer Template

```markdown
# Workflow Run: {workflow_name}

## Definition
- **Name:** {workflow_name}
- **Working Dir:** {working_dir}/
- **Total Steps:** {count}
- **Triggered By:** "{user_task}"

## Execution Log

| # | Agent | Task | Status | Duration | Output |
|---|-------|------|--------|----------|--------|
| 1 | backend | Build API | ✅ | 45s | 8 files |
| 2 | security | Audit | ✅ | 30s | 7 findings |
| 3 | data | Price feed | ✅ | 20s | 1 file |
| 4 | frontend | Trading UI | ✅ | 30s | 6 files |
| 5 | reviewer | Code review | ✅ | 15s | report |

## Results
- **Files Created:** {total_files}
- **Total Duration:** {total_duration}
- **Success Rate:** {percentage}%
- **Skipped Agents:** {list or none}

## Issues
- {issue_1}
- {issue_2}

---
*Executed: {date}*
```

### agents Drawer Template

```markdown
# Agent: {role_name}

## Capabilities
- **Skills:** {skill_list}
- **Tags:** {tag_list}
- **Best For:** {what it excels at}

## Performance History
| Date | Task | Duration | Status | Notes |
|------|------|----------|--------|-------|
| {date} | {task} | {duration} | ✅/❌ | {note} |

## Preferences
- **Task format:** {what format works best}
- **Response style:** {how it responds}
- **Known issues:** {quirks}

## Tips for Delegation
1. {tip_1}
2. {tip_2}
3. {tip_3}

## Reliability Score
- **Completion rate:** {percentage}%
- **Avg duration:** {seconds}s
- **Last used:** {date}

---
*Updated: {date}*
```

### patterns Drawer Template

```markdown
# Pattern: {pattern_name}

## Category
code | config | workflow | security | architecture

## Problem
{What problem does this pattern solve?}

## Solution
```{language}
{code_example}
```

## When to Use
- {scenario_1}
- {scenario_2}

## When NOT to Use
- {anti_scenario_1}

## Trade-offs
- **Pros:** {benefits}
- **Cons:** {costs}

## Real Examples
- {project_1}: {file_path}
- {project_2}: {file_path}

---
*Discovered: {date} in {project}*
```

### lessons Drawer Template

```markdown
# Lesson: {short_title}

## Type
success | failure | tip | warning | discovery

## Context
- **Project:** {project}
- **Agent:** {agent}
- **Date:** {date}

## What Happened
{Description of the situation}

## Insight
{The key takeaway}

## Actionable Advice
1. **Do:** {what to do}
2. **Don't:** {what to avoid}

## Impact
★★★★★ (1-5)

## Related
- Bug: {bug_id}
- Pattern: {pattern_name}
- Decision: {adr_number}

---
*Learned: {date}*
```

---

## Cross-Wing Tunnels

Tunnels connect rooms across wings for navigation:

```
projects ←→ decisions    (project ↔ why decisions made)
projects ←→ bugs         (project ↔ bugs found in it)
bugs ←→ patterns         (bug fix ↔ pattern that prevents it)
security ←→ patterns     (finding ↔ security pattern)
workflows ←→ agents      (workflow ↔ which agents ran)
agents ←→ lessons        (agent ↔ what we learned about it)
```

---

## Knowledge Graph Entities

The KG stores relationships between entities:

```
pipal-a2a → has_version → v0.3.0
pipal-a2a → has_feature → workflow-prehook
btc-trading → built_by → backend
btc-trading → audited_by → security
btc-trading → has_endpoint → /ticker
backend → prefers → specific-task-descriptions
```

---

## Flow: When Agent Starts Task

```
1. kg_query("btc-trading")     → What do we know about this project?
2. search("btc-trading")       → Any existing drawers?
3. check_duplicate(task)       → Was this done before?
4. ← Gets context from palace
5. Agent executes task
6. add_drawer(result)          → Store what was built
7. kg_add(fact)                → Store new knowledge
8. diary_write(entry)          → Log what happened
```

---

## Naming Convention

| Entity | Format | Example |
|--------|--------|---------|
| Wing | `wing_a2a` | All pipal-a2a agents |
| Room | lowercase-hyphen | `projects`, `decisions`, `bugs` |
| Drawer | Content with metadata | `PROJ: btc-trading \| STATUS: complete` |
| KG Subject | project or agent name | `btc-trading`, `backend` |
| KG Predicate | relationship | `built_by`, `has_endpoint` |
| KG Object | value | `backend`, `/ticker` |
| Diary | AAAK format | `PROJ: btc-trading \| BUILT: 8 files \| ★★★★` |
