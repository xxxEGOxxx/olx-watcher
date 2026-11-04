// Docker HEALTHCHECK: healthy while the poll loop keeps refreshing the heartbeat.
import { heartbeatAgeMs } from "./heartbeat.ts";

const dataDir = process.env.DATA_DIR ?? "./data";
const intervalMs = Number(process.env.POLL_INTERVAL_MINUTES ?? "10") * 60_000;
const age = heartbeatAgeMs(dataDir);

if (age === null || age > intervalMs * 3) {
  console.error(
    `unhealthy: heartbeat age ${age === null ? "missing" : `${Math.round(age / 1000)}s`}`,
  );
  process.exit(1);
}
