export type SourceKind = "none" | "otodom";

export type Config = {
  telegramBotToken: string;
  telegramChatId: string;
  searchUrls: string[];
  source: SourceKind;
  pollIntervalMinutes: number;
  dataDir: string;
};

const SOURCES: readonly SourceKind[] = ["none", "otodom"];
const SOURCE_HOSTS: Record<SourceKind, string | null> = { none: null, otodom: "www.otodom.pl" };

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

  const source = (env.SOURCE ?? "none") as SourceKind;
  if (!SOURCES.includes(source)) errors.push(`SOURCE must be one of: ${SOURCES.join(", ")}`);
  const host = SOURCE_HOSTS[source];
  for (const url of host ? searchUrls : []) {
    if (!URL.canParse(url) || new URL(url).hostname !== host) {
      errors.push(`SEARCH_URLS: ${url} is not a ${host} URL (SOURCE=${source})`);
    }
  }

  const pollIntervalMinutes = Number(env.POLL_INTERVAL_MINUTES ?? "10");
  if (!Number.isFinite(pollIntervalMinutes) || pollIntervalMinutes < 5) {
    errors.push("POLL_INTERVAL_MINUTES must be a number >= 5");
  }

  if (errors.length > 0) throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  return {
    telegramBotToken,
    telegramChatId,
    searchUrls,
    source,
    pollIntervalMinutes,
    dataDir: env.DATA_DIR ?? "./data",
  };
}
