import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.ts";
import { pollOnce } from "../src/index.ts";
import type { Listing } from "../src/listing.ts";
import { openStore } from "../src/store.ts";
import type { TelegramClient } from "../src/telegram/client.ts";
import { escapeHtml, formatListing } from "../src/telegram/format.ts";
import { listing } from "./costs.test.ts";

const SEARCH = "https://www.olx.pl/nieruchomosci/mieszkania/wynajem/warszawa/";

function fakeTelegram() {
  const sent: string[] = [];
  const telegram: TelegramClient = {
    sendMessage: async (_chat, html) => {
      sent.push(html);
    },
    sendLocation: async () => {},
  };
  return { sent, telegram };
}

describe("pollOnce", () => {
  it("stays silent on the first pass and notifies only new listings afterwards", async () => {
    let batch: Listing[] = [listing({ id: "olx:1" })];
    const source = { kind: "none" as const, fetchLatest: async () => batch };
    const store = openStore(":memory:");
    const { sent, telegram } = fakeTelegram();
    const deps = { source, store, telegram, chatId: "1" };

    await pollOnce([SEARCH], deps);
    assert.equal(sent.length, 0);

    batch = [listing({ id: "olx:2", title: "Nowe" }), listing({ id: "olx:1" })];
    await pollOnce([SEARCH], deps);
    assert.equal(sent.length, 1);
    assert.match(sent[0] ?? "", /Nowe/);

    await pollOnce([SEARCH], deps);
    assert.equal(sent.length, 1);
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
  it("rejects placeholders and non-OLX URLs", () => {
    assert.throws(
      () =>
        loadConfig({
          TELEGRAM_BOT_TOKEN: "CHANGE_ME",
          TELEGRAM_CHAT_ID: "1",
          OLX_SEARCH_URLS: "https://example.com/",
        }),
      /TELEGRAM_BOT_TOKEN is required[\s\S]*not an olx\.pl URL/,
    );
  });
});
