import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.ts";
import { writeHeartbeat } from "./heartbeat.ts";
import { createSource } from "./sources/index.ts";
import type { ListingSource } from "./sources/types.ts";
import { openStore, type SeenStore } from "./store.ts";
import { createTelegramClient, type TelegramClient } from "./telegram/client.ts";
import { formatListing } from "./telegram/format.ts";

const log = (message: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...extra }));

/** Caps requests per poll so a burst of new listings cannot hammer the site. */
const MAX_DETAILS_PER_SEARCH = 10;
/** Pause between detail requests. */
const DETAIL_DELAY_MS = 3_000;

export type Deps = {
  source: ListingSource;
  store: SeenStore;
  telegram: TelegramClient;
  chatId: string;
  delay?: (ms: number) => Promise<unknown>;
};

/**
 * One pass over all searches. The first pass of a search only records ids (no message flood).
 * A listing is marked seen only after it was sent, so a failed detail fetch is retried next poll.
 */
export async function pollOnce(searchUrls: string[], deps: Deps): Promise<void> {
  const delay = deps.delay ?? sleep;
  for (const search of searchUrls) {
    try {
      const warm = deps.store.isWarm(search);
      const refs = await deps.source.search(search);
      const fresh = refs.filter((ref) => !deps.store.isSeen(ref.id));

      if (!warm) {
        for (const ref of fresh) deps.store.markSeen(ref.id, search, false);
        deps.store.markWarm(search);
        log("search warmed", { search, total: refs.length });
        continue;
      }

      // Oldest first so the chat reads chronologically.
      const batch = fresh.slice(0, MAX_DETAILS_PER_SEARCH).toReversed();
      let sent = 0;
      for (const ref of batch) {
        if (sent > 0) await delay(DETAIL_DELAY_MS);
        try {
          const listing = await deps.source.details(ref);
          await deps.telegram.sendMessage(deps.chatId, formatListing(listing));
          const { lat, lon, approximate } = listing.location;
          if (lat !== null && lon !== null && !approximate) {
            await deps.telegram.sendLocation(deps.chatId, lat, lon);
          }
          deps.store.markSeen(ref.id, search, true);
          sent += 1;
        } catch (error) {
          log("listing failed", { url: ref.url, error: errorMessage(error) });
        }
      }
      log("search polled", { search, total: refs.length, fresh: fresh.length, sent });
    } catch (error) {
      log("search failed", { search, error: errorMessage(error) });
    }
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

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

  while (!stop.signal.aborted) {
    await pollOnce(config.searchUrls, deps);
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
    console.error(errorMessage(error));
    process.exit(1);
  });
}
