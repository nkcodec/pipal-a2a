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
