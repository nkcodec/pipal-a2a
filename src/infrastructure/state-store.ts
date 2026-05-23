/**
 * PiPal-A2A Infrastructure — StateStore
 *
 * SQLite-backed persistence for agents, tasks, and push configs.
 * Crash-safe via WAL journal mode. Zero external dependencies (node:sqlite).
 *
 * karpathy-clean-code: Infrastructure layer implementation.
 * Not in SDK — only SharedStateServer uses this directly.
 */

import type { AgentCard, TaskState, PushNotificationConfig } from "../core/types.js";
import type { StoredTask } from "./shared-state.js";

// node:sqlite is experimental in Node v22 — clear error if unavailable
let DatabaseSync: any;
try {
  const sqlite = await import("node:sqlite");
  DatabaseSync = sqlite.DatabaseSync;
} catch {
  throw new Error(
    "[StateStore] node:sqlite not available. Requires Node.js v22+. " +
    "Install with: nvm install 22"
  );
}

// ─────────────────────────────────────────────────────────────────
// StateStore — SQLite persistence for pipal-a2a state
// ─────────────────────────────────────────────────────────────────

export class StateStore {
  private db: InstanceType<typeof DatabaseSync> | null = null;

  constructor(private readonly dbPath: string) {}

  // ── Lifecycle ────────────────────────────────────────────────

  async init(): Promise<void> {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA synchronous=NORMAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        card_json TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        task_json TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS push_configs (
        id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  // ── Agent CRUD ───────────────────────────────────────────────

  getAgent(name: string): AgentCard | undefined {
    const stmt = this.db!.prepare("SELECT card_json FROM agents WHERE name = ?");
    const row = stmt.get(name) as { card_json: string } | undefined;
    return row ? JSON.parse(row.card_json) : undefined;
  }

  setAgent(card: AgentCard): void {
    const stmt = this.db!.prepare(
      "INSERT INTO agents (name, card_json) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET card_json = excluded.card_json, updated_at = datetime('now')"
    );
    stmt.run(card.name, JSON.stringify(card));
  }

  deleteAgent(name: string): void {
    const stmt = this.db!.prepare("DELETE FROM agents WHERE name = ?");
    stmt.run(name);
  }

  listAgents(): AgentCard[] {
    const stmt = this.db!.prepare("SELECT card_json FROM agents ORDER BY updated_at");
    const rows = stmt.all() as { card_json: string }[];
    return rows.map(r => JSON.parse(r.card_json));
  }

  // ── Task CRUD ────────────────────────────────────────────────

  getTask(id: string): StoredTask | undefined {
    const stmt = this.db!.prepare("SELECT task_json FROM tasks WHERE id = ?");
    const row = stmt.get(id) as { task_json: string } | undefined;
    return row ? JSON.parse(row.task_json) : undefined;
  }

  setTask(task: StoredTask): void {
    const stmt = this.db!.prepare(
      "INSERT INTO tasks (id, state, task_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, task_json = excluded.task_json, updated_at = datetime('now')"
    );
    stmt.run(task.id, task.status.state, JSON.stringify(task));
  }

  updateTaskState(id: string, state: TaskState, taskJson?: string): void {
    if (taskJson) {
      const stmt = this.db!.prepare(
        "UPDATE tasks SET state = ?, task_json = ?, updated_at = datetime('now') WHERE id = ?"
      );
      stmt.run(state, taskJson, id);
    } else {
      const stmt = this.db!.prepare(
        "UPDATE tasks SET state = ?, updated_at = datetime('now') WHERE id = ?"
      );
      stmt.run(state, id);
    }
  }

  deleteTask(id: string): void {
    const stmt = this.db!.prepare("DELETE FROM tasks WHERE id = ?");
    stmt.run(id);
  }

  listTasks(): StoredTask[] {
    const stmt = this.db!.prepare("SELECT task_json FROM tasks ORDER BY updated_at");
    const rows = stmt.all() as { task_json: string }[];
    return rows.map(r => JSON.parse(r.task_json));
  }

  // ── Push Config CRUD ─────────────────────────────────────────

  getPushConfig(id: string): PushNotificationConfig | undefined {
    const stmt = this.db!.prepare("SELECT config_json FROM push_configs WHERE id = ?");
    const row = stmt.get(id) as { config_json: string } | undefined;
    return row ? JSON.parse(row.config_json) : undefined;
  }

  setPushConfig(id: string, config: PushNotificationConfig): void {
    const stmt = this.db!.prepare(
      "INSERT INTO push_configs (id, config_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = datetime('now')"
    );
    stmt.run(id, JSON.stringify(config));
  }

  deletePushConfig(id: string): void {
    const stmt = this.db!.prepare("DELETE FROM push_configs WHERE id = ?");
    stmt.run(id);
  }

  listPushConfigs(): Array<{ id: string; config: PushNotificationConfig }> {
    const stmt = this.db!.prepare("SELECT id, config_json FROM push_configs ORDER BY updated_at");
    const rows = stmt.all() as { id: string; config_json: string }[];
    return rows.map(r => ({ id: r.id, config: JSON.parse(r.config_json) }));
  }
}
