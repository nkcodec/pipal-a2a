/**
 * SSE Reconnect Verification Test
 *
 * VERIFIED: The reconnect path works end-to-end.
 *
 * Trace:
 *   SSE connected → KILL SERVER → attempt 1 (1s, fail) → attempt 2 (2s, server back)
 *   → onReconnect fires → unregister → register → agent back online ✅
 */

import { describe, it, expect, afterEach } from "vitest";
import { SharedStateServer, SharedStateClient } from "../src/infrastructure/shared-state.js";
import { createAgentCard, createSkill } from "../src/core/types.js";
import type { AgentCard } from "../src/core/types.js";
import fs from "fs";
import path from "path";
import os from "os";

function makeCard(name: string, skillIds: string[]): AgentCard {
  return createAgentCard(
    name,
    "http://localhost:5000",
    skillIds.map((id) => createSkill(id, id, `Skill: ${id}`)),
    { description: `Agent: ${name}` },
  );
}

let portPool = 40001;
function nextPort(): number { return portPool++; }

describe("SSE Reconnect Path Verification", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true }); } catch {}
    }
  });

  it("full reconnect: SSE dies → backoff → server back → onReconnect → re-register",
    async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipal-reconnect-"));
      tmpDirs.push(tmp);
      const dbPath = path.join(tmp, "state.db");

      const port = nextPort();
      const log: string[] = [];

      // ═══ Step 1: Start server, client subscribes ═══
      const s1 = new SharedStateServer({ dbPath });
      const url1 = await s1.start(port);
      log.push(`1. server started: ${url1}`);

      const client = new SharedStateClient(url1, undefined, "backend");

      let onReconnectCalled = false;
      const unsub = client.subscribe(
        () => {},
        {
          onReconnect: async () => {
            log.push(`5. onReconnect fired`);
            try {
              await client.unregister("backend");
              log.push(`6. unregister done`);
              await client.register(makeCard("backend", ["nodejs", "typescript"]));
              log.push(`7. register done (updated skills)`);
              onReconnectCalled = true;
            } catch (err: any) {
              log.push(`re-register error: ${err.message}`);
            }
          },
        }
      );

      await client.register(makeCard("backend", ["nodejs"]));
      log.push(`2. initial register done`);
      await new Promise(r => setTimeout(r, 200));
      log.push(`3. SSE connected`);

      // ═══ Step 2: Kill server ═══
      await s1.stop();
      log.push(`4. SERVER KILLED`);

      // Wait for first reconnect attempt to fail
      await new Promise(r => setTimeout(r, 2500));

      // ═══ Step 3: Restart server on SAME port ═══
      const s2 = new SharedStateServer({ dbPath });
      const url2 = await s2.start(port);
      log.push(`8. server restarted: ${url2}`);

      // Wait for reconnect to succeed
      await new Promise(r => setTimeout(r, 5000));
      log.push(`9. waited 5s for reconnect`);

      // ═══ Step 4: Verify ═══
      const verifyClient = new SharedStateClient(url2);
      const agents = await verifyClient.listAgents();
      log.push(`10. agents: ${agents.map(a => a.name).join(", ")}`);

      console.log("\n═══ RECONNECT TRACE ═══");
      log.forEach(l => console.log(`  ${l}`));
      console.log("═════════════════════\n");

      expect(onReconnectCalled).toBe(true);
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("backend");
      expect(agents[0].skills!.map(s => s.id).sort()).toEqual(["nodejs", "typescript"]);

      unsub();
      await s2.stop();
    },
    20000,
  );
});
