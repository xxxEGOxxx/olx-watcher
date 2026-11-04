import type { Browser, Page } from "playwright";

/**
 * A stock Playwright Chromium, used as-is: no stealth plugins, no user-agent or fingerprint
 * overrides, no proxies. If a site starts rejecting it, report that instead of disguising it.
 */
export type BrowserSession = {
  /** Starts the browser and opens `origin` so later same-origin fetches carry its cookies. */
  open(origin: string): Promise<void>;
  /** GET a JSON URL from inside the page (same-origin fetch). */
  getJson(url: string): Promise<unknown>;
  /** Navigates to a page and returns its HTML (used for single-link parsing). */
  pageHtml(url: string): Promise<string>;
  close(): Promise<void>;
};

export function createBrowserSession(): BrowserSession {
  let browser: Browser | null = null;
  let page: Page | null = null;

  const requirePage = () => {
    if (!page) throw new Error("browser session is not open");
    return page;
  };

  return {
    async open(origin) {
      if (page) return;
      const { chromium } = await import("playwright");
      // --disable-dev-shm-usage: Docker's 64 MB /dev/shm is too small for Chromium.
      browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
      page = await browser.newPage({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
      const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (response && response.status() >= 400) {
        throw new Error(`${origin} answered ${response.status()} to the browser`);
      }
    },
    async getJson(url) {
      const result = await requirePage().evaluate(async (target) => {
        const response = await fetch(target, { headers: { accept: "application/json" } });
        return { status: response.status, body: response.ok ? await response.json() : null };
      }, url);
      if (result.status !== 200) throw new Error(`GET ${url} answered ${result.status}`);
      return result.body;
    },
    async pageHtml(url) {
      const current = requirePage();
      const response = await current.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (response && response.status() >= 400)
        throw new Error(`${url} answered ${response.status()}`);
      return current.content();
    },
    async close() {
      await browser?.close().catch(() => undefined);
      browser = null;
      page = null;
    },
  };
}
