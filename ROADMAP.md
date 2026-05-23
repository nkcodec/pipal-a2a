# PiPal-A2A Roadmap

**Google A2A v1.0 compliant — each pi terminal IS an agent.**

> **v0.3.2 shipped** — Full A2A spec compliance. 145 tests. Security hardened. MemPalace integrated.

---

## Versioning Strategy

```
v0.1.0  ← Foundation (core types + shared state + extension + tests)
v0.1.1  ← JSON-RPC 2.0 at POST /rpc ✅
v0.1.2  ← Streaming (SendStreamingMessage) ✅
v0.1.3  ← Multi-turn (contextId) ✅
v0.1.4  ← Auth (API Key) ✅
v0.1.5  ← Agent card discovery ✅
v0.1.6  ← Push notifications ✅
v0.1.7  ← Auto-Router (tag-based) ✅
v0.2.0  ← Essential A2A v1.0 features ✅
v0.2.1  ← Security hardening (Tier 1) ✅
v0.2.2  ← Infrastructure reliability (Tier 2) ✅
v0.2.3  ← Role reference pattern (DRY) ✅
v0.2.4  ← .env file support ✅
v0.3.0  ← Workflow PreHook ✅
v0.3.1  ← MemPalace integration ✅
v0.3.2  ← Full A2A spec compliance + security audit ✅
```

---

## v0.3.2 — Full A2A Spec Compliance ✅ SHIPPED

### A2A Spec Features (all already implemented)

| Feature | Status |
|---------|--------|
| JSON-RPC binding (`/rpc`) | ✅ `POST /rpc` with JSON-RPC 2.0 |
| `tasks/sendMessage` | ✅ Registered |
| `tasks/getTask` | ✅ Registered |
| `tasks/cancelTask` | ✅ Registered |
| `tasks/resolveTask` | ✅ Registered |
| `tasks/listTasks` | ✅ Registered |
| `tasks/streamChunk` | ✅ Registered |
| `tasks/addMessage` | ✅ Registered (multi-turn) |
| `A2A-Version: 1.0` header | ✅ On all responses |
| JSON-RPC error codes | ✅ A2A spec mapped |

### Security Audit (11 issues fixed)

| ID | Issue | Fix |
|----|-------|-----|
| C-1 | Server binds 0.0.0.0 | `127.0.0.1` default + configurable host |
| C-2 | Zero-auth default | Fixed by localhost binding |
| H-1 | YAML RCE via `!!js/function` | `JSON_SCHEMA` |
| H-2 | Agent impersonation | 409 on duplicate name |
| H-3 | SSRF private IPs | RFC 1918 + loopback blocked |
| H-4 | SSE broadcasts all data | Per-agent scoping |
| H-5 | Error details leaked | Generic "Internal error" |
| H-6 | Task state race condition | Per-task mutex |
| H-7 | subscribe() unhandled rejection | `.catch()` handler |
| H-8 | Heartbeat interval leak | Clear on broadcast failure |
| H-9 | Timeout doesn't unsubscribe | `unsubscribe()` before reject |

### MemPalace Integration

- Planner owns MemPalace via `promptGuidelines`
- Agents never see MemPalace (clean separation)
- Config: `mempalace.enabled`, `wing`, `sharedRoom`
- OFF by default (config activates, not defines)

### Configurable Host

```yaml
# localhost only (default, secure)
# host: "127.0.0.1"

# multi-machine (requires apiKey!)
# host: "0.0.0.0"
```

**145 tests. 10 E2E scenarios verified.**

---

## Non-Goals

- ❌ Central orchestrator (P2P!)
- ❌ MCP for agent communication (A2A is the right protocol)
- ❌ Custom protocol (Google A2A is the standard)
- ❌ Agent marketplace (own team only)

---

## Future Ideas (post v0.3.2)

| Idea | When to build |
|------|--------------|
| Structured agent responses | When users ask for better formatting |
| Auto-role assignment | When 5+ terminal teams become common |
| gRPC binding | When 100+ agents needed |
| pi-file-guard | When prompts can't prevent wrong writes |
| OAuth2 | When enterprise deployment needed |
| Rate limiting | When abuse becomes real |

---

## Architecture

```
Star topology (hub-and-spoke)
                         
  Terminal 1 (planner = HOST)
  ┌──────────────────────┐
  │  Shared State Server  │ ← first terminal auto-starts
  │  localhost:5000       │    others JOIN as clients
  │  (rendezvous + SSE)   │
  └──────┬───┬───┬────────┘
         │   │   │  JSON-RPC + SSE
    ┌────┘   │   └────┐
    ▼        ▼        ▼
 backend  reviewer  frontend
 (JOIN)   (JOIN)    (JOIN)
```

**Honest assessment:** This is star topology, not true P2P mesh.

- The first agent to start becomes HOST (runs the server)
- All other agents JOIN as clients
- ALL communication routes through HOST
- If HOST dies, the network dies (single point of failure)
- Any agent CAN delegate to any other — but traffic goes through the server

This is correct for the use case (3-5 agents on localhost).
True P2P mesh (Gossip, Raft, CRDTs) is YAGNI until someone needs 50+ agents or fault tolerance.

---

## Success Criteria

1. ✅ **Spec compliant** — Google A2A v1.0 data model + JSON-RPC 2.0
2. ✅ **Installable** — `pi install pipal-a2a` works
3. ✅ **Real agents** — Each pi terminal IS an agent with full LLM + tools
4. ✅ **Real-time** — SSE streaming, no polling
5. ✅ **Delegation** — `pipal_a2a_delegate()` → task routes → result returns
6. ✅ **Observable** — `pipal_a2a_agents()`, `pipal_a2a_status()`
7. ✅ **Secure** — localhost binding, SSRF protection, YAML RCE prevented
8. ✅ **Zero config** — Works with defaults, configurable when needed
9. ✅ **145 tests** — Core, infrastructure, extension, routing, clarity guard
