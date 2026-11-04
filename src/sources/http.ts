/**
 * Honest HTTP client: identifies itself, one request at a time, no browser impersonation.
 * Sites answer it from a residential connection; datacenter IPs (the flotana VPS) get a 403.
 */
export const USER_AGENT = "olx-watcher/0.1 (personal rental alerts)";

export class BlockedError extends Error {
  constructor(url: string, status: number) {
    super(
      `${new URL(url).hostname} answered ${status}: this network is blocked, see docs/access.md`,
    );
  }
}

export type FetchHtml = (url: string) => Promise<string>;

export function createFetchHtml(fetchImpl: typeof fetch = fetch): FetchHtml {
  return async (url) => {
    const response = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": "pl" },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 403) throw new BlockedError(url, response.status);
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
    return response.text();
  };
}

/** Reads the JSON that Next.js sites (otodom) embed for hydration. */
export function extractNextData(html: string): unknown {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error("__NEXT_DATA__ not found; the page layout may have changed");
  return JSON.parse(match[1]);
}
