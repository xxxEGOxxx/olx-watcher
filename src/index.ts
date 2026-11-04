import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.ts";
import { writeHeartbeat } from "./heartbeat.ts";
import { createSources } from "./sources/index.ts";
import type { ListingSource } from "./sources/types.ts";
import { openStore, type SeenStore } from "./store.ts";
import { createTelegramClient, type TelegramClient } from "./telegram/client.ts";
import { formatListing } from "./telegram/format.ts";

const log = (message: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...extra }));

/** Caps messages per search per poll so a burst cannot flood the chat or hammer the site. */
const MAX_DETAILS_PER_SEARCH = 10;
/** Pause between detail requests (only when a listing needs its own request). */
const DETAIL_DELAY_MS = 3_000;

export type Deps = {
  sources: ListingSource[];
  store: SeenStore;
  telegram: TelegramClient;
  chatId: string;
  delay?: (ms: number) => Promise<unknown>;
};

/**
 * One pass over the searches this runner owns. Each source is opened once per pass (a browser
 * lives only while polling) and closed afterwards. The first pass of a search only records ids
 * (no message flood). A listing is marked seen only after it was sent, so failures retry.
 * Returns how many searches failed, so a one-shot run (GitHub Actions) can fail loudly.
 */
export async function pollOnce(searchUrls: string[], deps: Deps): Promise<number> {
  let failed = 0;
  for (const source of deps.sources) {
    const searches = searchUrls.filter((url) => source.handles(url));
    if (searches.length === 0) continue;
    try {
      await source.open?.();
      for (const search of searches) {
        if (!(await pollSearch(source, search, deps))) failed += 1;
      }
    } catch (error) {
      failed += searches.length;
      log("source failed", { source: source.kind, error: errorMessage(error) });
    } finally {
      await source.close?.();
    }
  }
  return failed;
}

/** false when the search itself could not be read (blocked, layout change, network). */
async function pollSearch(source: ListingSource, search: string, deps: Deps): Promise<boolean> {
  const delay = deps.delay ?? sleep;
  try {
    const warm = deps.store.isWarm(search);
    const refs = await source.search(search);
    const fresh = refs.filter((ref) => !deps.store.isSeen(ref.id));

    if (!warm) {
      for (const ref of fresh) deps.store.markSeen(ref.id, search, false);
      deps.store.markWarm(search);
      log("search warmed", { search, total: refs.length });
      return true;
    }

    // Oldest first so the chat reads chronologically.
    const batch = fresh.slice(0, MAX_DETAILS_PER_SEARCH).toReversed();
    let requested = 0;
    let sent = 0;
    for (const ref of batch) {
      try {
        if (!ref.listing && requested++ > 0) await delay(DETAIL_DELAY_MS);
        const listing = await source.details(ref);
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
    return true;
  } catch (error) {
    log("search failed", { search, error: errorMessage(error) });
    return false;
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function main(): Promise<void> {
  const config = loadConfig();
  const once = process.argv.includes("--once");
  const deps: Deps = {
    sources: createSources(config),
    store: openStore(config.dataDir),
    telegram: createTelegramClient(config.telegramBotToken),
    chatId: config.telegramChatId,
  };
  const stop = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => stop.abort());
  }

  const owned = config.searchUrls.filter((url) =>
    deps.sources.some((source) => source.handles(url)),
  );
  log("started", { sources: config.sources, searches: owned.length, once });

  let failed = 0;
  while (!stop.signal.aborted) {
    failed = await pollOnce(owned, deps);
    writeHeartbeat(config.dataDir);
    if (once) break;
    // ±20% jitter so requests do not land on a fixed schedule.
    const delay = config.pollIntervalMinutes * 60_000 * (0.8 + Math.random() * 0.4);
    await sleep(delay, undefined, { signal: stop.signal }).catch(() => undefined);
  }

  deps.store.close();
  log("stopped", { failedSearches: failed });
  if (once && failed > 0) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
