import { isOlxUrl } from "./sources/olx.ts";
import { isOtodomUrl } from "./sources/otodom.ts";

export type SourceKind = "olx" | "otodom";

export type Config = {
  telegramBotToken: string;
  telegramChatId: string;
  /** Every search of every runner; each runner polls only those of its `sources`. */
  searchUrls: string[];
  /** Sites this runner polls. The server runs `olx`; otodom blocks datacenter IPs. */
  sources: SourceKind[];
  /** Drop OLX copies of otodom ads (set where an otodom runner also reports them). */
  skipOtodomCopies: boolean;
  pollIntervalMinutes: number;
  dataDir: string;
};

const KNOWN: Record<SourceKind, (url: string) => boolean> = { olx: isOlxUrl, otodom: isOtodomUrl };

export function sourceOfUrl(url: string): SourceKind | null {
  return (Object.keys(KNOWN) as SourceKind[]).find((kind) => KNOWN[kind](url)) ?? null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = [];
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value || value === "CHANGE_ME") errors.push(`${name} is required`);
    return value ?? "";
  };

  const telegramBotToken = required("TELEGRAM_BOT_TOKEN");
  const telegramChatId = required("TELEGRAM_CHAT_ID");
  const searchUrls = (env.SEARCH_URLS ?? "")
    .split("|")
    .map((url) => url.trim())
    .filter(Boolean);
  if (searchUrls.length === 0) errors.push("SEARCH_URLS needs at least one URL");
  for (const url of searchUrls) {
    if (!sourceOfUrl(url))
      errors.push(`SEARCH_URLS: ${url} is neither www.olx.pl nor www.otodom.pl`);
  }

  const sources = (env.SOURCES ?? "olx")
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean) as SourceKind[];
  for (const kind of sources) {
    if (!(kind in KNOWN)) errors.push(`SOURCES: unknown source ${kind} (known: olx, otodom)`);
  }
  if (sources.length === 0) errors.push("SOURCES needs at least one of: olx, otodom");
  else if (!searchUrls.some((url) => sources.some((kind) => sourceOfUrl(url) === kind))) {
    errors.push(`SEARCH_URLS has no search for SOURCES=${sources.join(",")}`);
  }

  const pollIntervalMinutes = Number(env.POLL_INTERVAL_MINUTES ?? "15");
  if (!Number.isFinite(pollIntervalMinutes) || pollIntervalMinutes < 5) {
    errors.push("POLL_INTERVAL_MINUTES must be a number >= 5");
  }

  if (errors.length > 0) throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  return {
    telegramBotToken,
    telegramChatId,
    searchUrls,
    sources,
    skipOtodomCopies: ["1", "true", "yes"].includes((env.SKIP_OTODOM_COPIES ?? "").toLowerCase()),
    pollIntervalMinutes,
    dataDir: env.DATA_DIR ?? "./data",
  };
}
