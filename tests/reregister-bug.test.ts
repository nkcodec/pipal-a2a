/**
 * Bug verification: Agent re-registration after crash recovery
 *
 * When server restarts with DB containing agents,
 * agents trying to register get 409 Conflict.
 * This is a REAL bug in the crash recovery flow.
 */

import { describe, it, expect, afterEach } from "vitest";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { createAgentCard, createSkill } from "../src/core/types.js";
import fs from "fs";
import path from "path";
import os from "os";

let portPool = 46001;
function nextPort(): number { return portPool++; }

describe("Agent Re-registration After Crash", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true }); } catch {}
    }
  });

  it("agent re-register works after crash recovery (upsert)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-rereg-"));
    tmpDirs.push(tmp);
    const dbPath = path.join(tmp, "state.db");

    // Phase 1: Start server, register agent
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(nextPort());
    const c1 = new SharedStateClient(url1);

    const card = createAgentCard("planner", url1, [], { description: "Planner v1" });
    await c1.register(card);
    console.log("Phase 1: registered planner ✅");

    // CRASH
    await s1.stop();
    console.log("CRASH!");

    // Phase 2: Restart server — DB has planner
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(nextPort());
    const c2 = new SharedStateClient(url2);

    // Agent survived in DB
    const agents2 = await c2.listAgents();
    expect(agents2).toHaveLength(1);
    console.log("Phase 2: planner survived in DB ✅");

    // Agent re-registers (what happens on terminal restart)
    const updatedCard = createAgentCard("planner", url2, [], { description: "Planner v2 (reconnected)" });
    await c2.register(updatedCard);
    console.log("Phase 2: re-register SUCCESS ✅");

    // Card was updated
    const agents3 = await c2.listAgents();
    expect(agents3).toHaveLength(1);
    expect(agents3[0].description).toBe("Planner v2 (reconnected)");
    console.log("Phase 2: card updated ✅");

    await s2.stop();
  });

  it("FIX: unregister + register works as workaround", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-rereg-fix-"));
    tmpDirs.push(tmp);
    const dbPath = path.join(tmp, "state.db");

    // Phase 1
    const s1 = new SharedStateServer({ dbPath });
    const url1 = await s1.start(nextPort());
    const c1 = new SharedStateClient(url1);
    const card = createAgentCard("planner", url1, [], { description: "Planner" });
    await c1.register(card);
    await s1.stop();

    // Phase 2: restart → unregister → register
    const s2 = new SharedStateServer({ dbPath });
    const url2 = await s2.start(nextPort());
    const c2 = new SharedStateClient(url2);

    await c2.unregister("planner");
    await c2.register(card);

    const agents = await c2.listAgents();
    expect(agents).toHaveLength(1);
    console.log("Workaround works: unregister + register ✅");

    await s2.stop();
  });
});
