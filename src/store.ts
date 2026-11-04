import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Remembers which listings were already seen so each one is sent once. */
export type SeenStore = {
  /** True once a search has completed its first (silent) pass. */
  isWarm(search: string): boolean;
  markWarm(search: string): void;
  isSeen(id: string): boolean;
  markSeen(id: string, search: string, notified: boolean): void;
  close(): void;
};

export function openStore(dataDir: string | ":memory:"): SeenStore {
  let location = ":memory:";
  if (dataDir !== ":memory:") {
    mkdirSync(dataDir, { recursive: true });
    location = join(dataDir, "olx-watcher.sqlite");
  }
  const db = new DatabaseSync(location);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS seen_listing (
      id TEXT PRIMARY KEY,
      search TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      notified INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS warm_search (
      search TEXT PRIMARY KEY,
      warmed_at TEXT NOT NULL
    );
  `);

  const seen = db.prepare("SELECT 1 FROM seen_listing WHERE id = ?");
  const insertSeen = db.prepare(
    "INSERT OR IGNORE INTO seen_listing (id, search, first_seen_at, notified) VALUES (?, ?, ?, ?)",
  );
  const warm = db.prepare("SELECT 1 FROM warm_search WHERE search = ?");
  const insertWarm = db.prepare(
    "INSERT OR IGNORE INTO warm_search (search, warmed_at) VALUES (?, ?)",
  );

  return {
    isWarm: (search) => warm.get(search) !== undefined,
    markWarm: (search) => {
      insertWarm.run(search, new Date().toISOString());
    },
    isSeen: (id) => seen.get(id) !== undefined,
    markSeen: (id, search, notified) => {
      insertSeen.run(id, search, new Date().toISOString(), notified ? 1 : 0);
    },
    close: () => db.close(),
  };
}
