// `npm run parse -- <olx or otodom listing url>`: print the Telegram message for one listing.
// Add `--send` to also deliver it to TELEGRAM_CHAT_ID (needs .env).
import { costBreakdown, type Listing } from "./listing.ts";
import { createBrowserSession } from "./sources/browser.ts";
import { createFetchHtml } from "./sources/http.ts";
import { isOlxUrl, type OlxAd, olxAdIdFromHtml, parseOlxAd } from "./sources/olx.ts";
import { isOtodomUrl, parseAd } from "./sources/otodom.ts";
import { createTelegramClient } from "./telegram/client.ts";
import { formatListing } from "./telegram/format.ts";

const url = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!url || !(isOtodomUrl(url) || isOlxUrl(url))) {
  console.error(
    "Usage: npm run parse -- <https://www.olx.pl/d/oferta/... | https://www.otodom.pl/pl/oferta/...> [--send]",
  );
  process.exit(1);
}

const cleanUrl = new URL(url);
cleanUrl.search = "";

async function readOlx(adUrl: string): Promise<Listing> {
  const session = createBrowserSession();
  try {
    await session.open("https://www.olx.pl");
    const id = olxAdIdFromHtml(await session.pageHtml(adUrl));
    const body = (await session.getJson(`https://www.olx.pl/api/v1/offers/${id}/`)) as {
      data: OlxAd;
    };
    return parseOlxAd(body.data);
  } finally {
    await session.close();
  }
}

const listing = isOlxUrl(cleanUrl.toString())
  ? await readOlx(cleanUrl.toString())
  : parseAd(await createFetchHtml()(cleanUrl.toString()));
const html = formatListing(listing);
console.log(html);
console.log("\n", JSON.stringify(costBreakdown(listing)));

if (process.argv.includes("--send")) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  await createTelegramClient(token).sendMessage(chatId, html);
  console.log("sent");
}
