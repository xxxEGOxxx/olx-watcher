import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.ts";
import { writeHeartbeat } from "./heartbeat.ts";
import { createSource, type ListingSource } from "./olx/source.ts";
import { openStore, type SeenStore } from "./store.ts";
import { createTelegramClient, type TelegramClient } from "./telegram/client.ts";
import { formatListing } from "./telegram/format.ts";

const log = (message: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...extra }));

type Deps = {
  source: ListingSource;
  store: SeenStore;
  telegram: TelegramClient;
  chatId: string;
};

/** One pass over all searches. The first pass of a search only records ids (no message flood). */
export async function pollOnce(searchUrls: string[], deps: Deps): Promise<void> {
  for (const search of searchUrls) {
    const warm = deps.store.isWarm(search);
    const listings = await deps.source.fetchLatest(search);
    const fresh = listings.filter((listing) => !deps.store.isSeen(listing.id));

    // Oldest first so the chat reads chronologically.
    for (const listing of fresh.toReversed()) {
      if (warm) {
        await deps.telegram.sendMessage(deps.chatId, formatListing(listing));
        const { lat, lon } = listing.location;
        if (lat !== null && lon !== null && !listing.location.approximate) {
          await deps.telegram.sendLocation(deps.chatId, lat, lon);
        }
      }
      deps.store.markSeen(listing.id, search, warm);
    }
    if (!warm) deps.store.markWarm(search);
    log("search polled", { search, total: listings.length, fresh: fresh.length, warm });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const once = process.argv.includes("--once");
  const deps: Deps = {
    source: createSource(config.source),
    store: openStore(config.dataDir),
    telegram: createTelegramClient(config.telegramBotToken),
    chatId: config.telegramChatId,
  };
  const stop = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => stop.abort());
  }

  log("started", { source: config.source, searches: config.searchUrls.length, once });
  if (config.source === "none") log("OLX_SOURCE=none: nothing is fetched, see docs/olx-access.md");

  while (!stop.signal.aborted) {
    try {
      await pollOnce(config.searchUrls, deps);
    } catch (error) {
      log("poll failed", { error: error instanceof Error ? error.message : String(error) });
    }
    writeHeartbeat(config.dataDir);
    if (once) break;
    // ±20% jitter so requests do not land on a fixed schedule.
    const delay = config.pollIntervalMinutes * 60_000 * (0.8 + Math.random() * 0.4);
    await sleep(delay, undefined, { signal: stop.signal }).catch(() => undefined);
  }

  deps.store.close();
  log("stopped");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
