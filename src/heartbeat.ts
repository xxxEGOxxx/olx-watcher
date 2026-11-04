import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILE = "heartbeat";

/** Written after every poll cycle; the Docker healthcheck reads its age. */
export function writeHeartbeat(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, FILE), new Date().toISOString());
}

export function heartbeatAgeMs(dataDir: string, now = Date.now()): number | null {
  try {
    return now - statSync(join(dataDir, FILE)).mtimeMs;
  } catch {
    return null;
  }
}
