// `npm run parse -- <otodom listing url>`: print the Telegram message for one listing.
// Add `--send` to also deliver it to TELEGRAM_CHAT_ID (needs .env).
import { costBreakdown } from "./listing.ts";
import { createFetchHtml } from "./sources/http.ts";
import { isOtodomUrl, parseAd } from "./sources/otodom.ts";
import { createTelegramClient } from "./telegram/client.ts";
import { formatListing } from "./telegram/format.ts";

const url = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!url || !isOtodomUrl(url)) {
  console.error("Usage: npm run parse -- https://www.otodom.pl/pl/oferta/... [--send]");
  console.error("OLX pages answer 403 to any non-browser client; see docs/access.md.");
  process.exit(1);
}

const cleanUrl = new URL(url);
cleanUrl.search = "";
const listing = parseAd(await createFetchHtml()(cleanUrl.toString()));
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
