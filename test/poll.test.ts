import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.ts";
import { pollOnce } from "../src/index.ts";
import type { ListingRef, ListingSource } from "../src/sources/types.ts";
import { openStore } from "../src/store.ts";
import type { TelegramClient } from "../src/telegram/client.ts";
import { escapeHtml, formatListing } from "../src/telegram/format.ts";
import { listing } from "./costs.test.ts";

const SEARCH = "https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/mazowieckie/warszawa";

function harness() {
  const sent: string[] = [];
  const telegram: TelegramClient = {
    sendMessage: async (_chat, html) => {
      sent.push(html);
    },
    sendLocation: async () => {},
  };
  let refs: ListingRef[] = [];
  const failing = new Set<string>();
  const opened: string[] = [];
  const source: ListingSource = {
    kind: "test",
    handles: (url) => url.startsWith("https://www.otodom.pl/"),
    open: async () => {
      opened.push("open");
    },
    close: async () => {
      opened.push("close");
    },
    search: async () => refs,
    details: async (ref) => {
      if (failing.has(ref.id)) throw new Error("boom");
      return listing({ id: ref.id, title: `T ${ref.id}` });
    },
  };
  const deps = {
    sources: [source],
    store: openStore(":memory:"),
    telegram,
    chatId: "1",
    delay: async () => {},
  };
  const ref = (id: string) => ({ id, url: `https://www.otodom.pl/pl/oferta/${id}` });
  return {
    sent,
    deps,
    failing,
    opened,
    setRefs: (ids: string[]) => {
      refs = ids.map(ref);
    },
  };
}

describe("pollOnce", () => {
  it("stays silent on the first pass and notifies only new listings afterwards", async () => {
    const h = harness();
    h.setRefs(["a"]);
    await pollOnce([SEARCH], h.deps);
    assert.equal(h.sent.length, 0);

    h.setRefs(["c", "b", "a"]);
    await pollOnce([SEARCH], h.deps);
    assert.deepEqual(
      h.sent.map((html) => /T (\w)/.exec(html)?.[1]),
      ["b", "c"],
    );

    await pollOnce([SEARCH], h.deps);
    assert.equal(h.sent.length, 2);
  });

  it("retries a listing whose details failed", async () => {
    const h = harness();
    await pollOnce([SEARCH], h.deps);
    h.setRefs(["x"]);
    h.failing.add("x");
    assert.equal(await pollOnce([SEARCH], h.deps), 0, "a failed listing is not a failed search");
    assert.equal(h.sent.length, 0);
    h.failing.clear();
    await pollOnce([SEARCH], h.deps);
    assert.equal(h.sent.length, 1);
  });

  it("counts searches that could not be read", async () => {
    const h = harness();
    const blocked: ListingSource = {
      kind: "blocked",
      handles: () => true,
      search: async () => {
        throw new Error("GET answered 403");
      },
      details: async () => listing(),
    };
    assert.equal(await pollOnce([SEARCH, SEARCH], { ...h.deps, sources: [blocked] }), 2);
  });

  it("opens a source once per pass, closes it, and skips searches it does not handle", async () => {
    const h = harness();
    await pollOnce([SEARCH, `${SEARCH}?page=2`, "https://www.olx.pl/nieruchomosci/"], h.deps);
    assert.deepEqual(h.opened, ["open", "close"]);
  });
});

describe("format", () => {
  it("escapes HTML and shows totals and the map link", () => {
    const html = formatListing(listing({ title: "<b>2 pokoje & balkon</b>" }));
    assert.match(html, /&lt;b&gt;2 pokoje &amp; balkon/);
    assert.match(html, /В месяц: 3 600 zł/);
    assert.match(html, /google\.com\/maps\?q=52\.19,21\.02/);
    assert.equal(escapeHtml("a<b"), "a&lt;b");
  });
});

describe("config", () => {
  const base = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };

  it("rejects placeholders, foreign sites and runners without a matching search", () => {
    assert.throws(
      () =>
        loadConfig({
          ...base,
          TELEGRAM_BOT_TOKEN: "CHANGE_ME",
          SOURCES: "otodom",
          SEARCH_URLS: "https://www.olx.pl/nieruchomosci/|https://example.com/",
        }),
      /TELEGRAM_BOT_TOKEN is required[\s\S]*example\.com\/ is neither[\s\S]*no search for SOURCES=otodom/,
    );
  });

  it("defaults to the OLX runner polling every 15 minutes", () => {
    const config = loadConfig({
      ...base,
      SEARCH_URLS: `https://www.olx.pl/nieruchomosci/mieszkania/wynajem/poznan/ | ${SEARCH}`,
    });
    assert.deepEqual(config.sources, ["olx"]);
    assert.equal(config.pollIntervalMinutes, 15);
    assert.equal(config.skipOtodomCopies, false);
    assert.equal(config.searchUrls.length, 2);
  });
});
