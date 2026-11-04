# olx-watcher agent guide

olx-watcher watches rental searches on OLX.pl and otodom.pl and sends each new listing to the
owner's Telegram with a cost breakdown: rent, czynsz administracyjny, media, kaucja, agency commission (prowizja), monthly
and move-in totals, and a map point. Single-user personal tool. Product notes: `docs/product.md`.

Stack: Node 24 running TypeScript directly (type stripping, no build step), strict ESM, `node:test`,
`node:sqlite`, Biome, npm. One runtime dependency: `playwright` (pinned, headless Chromium shell)
for OLX. Add another only if it clearly beats ~50 lines of glue, and say why in the commit.

## Commands

- `npm ci` once; `npm run check` = Biome + `tsc --noEmit` + tests. Run it before every commit.
- Focused test: `node --test test/costs.test.ts`.
- Local run: `cp .env.example .env`, fill it, `npm run once` (single poll) or `npm run dev`.
- Local Chromium for Playwright: `npx playwright install --only-shell chromium` (once).
- One listing: `npm run parse -- <olx or otodom url>` prints the Telegram message (`--send`
  delivers it).
- Deploy: `npm run deploy:production` (see "Deploy" below). Ops: `npm run server -- status|logs|
  restart|once|env-push`. otodom runs in GitHub Actions (`.github/workflows/otodom.yml`):
  `gh workflow run otodom`, `gh run list -w otodom`, `gh run view --log`.

## Layout

- `src/listing.ts` — the normalized `Listing` model and `costBreakdown()`. Every source maps into it.
- `src/description.ts` — Polish free-text heuristics (kaucja, czynsz, media, prowizja). Structured
  source fields win; heuristics only fill gaps. Every new pattern gets a test with a real phrase.
- `src/money.ts` — money is integer grosze. Never add złoty as floats; use `parsePln`/`formatPln`.
- `src/sources/` — `ListingSource` (`handles` a search URL, `search` → refs, `details` →
  `Listing`, optional `open`/`close` per poll). `olx.ts`: search URL → `/api/v1/offers` filters and
  the ad parser; requests go through `browser.ts` (one stock Chromium page on olx.pl, same-origin
  `fetch`, closed after every poll). `otodom.ts`: honest HTTP client (`http.ts`) + Next.js
  `__NEXT_DATA__` parser. Parser tests run on trimmed real payloads in `test/fixtures/`; refresh
  them when a site changes its payload.
- `src/config.ts` — `SEARCH_URLS` (any mix of OLX and otodom) and `SOURCES` (which sites this
  runner polls). The same search list can live on every runner.
- `src/store.ts` — SQLite de-duplication; first pass of a search is silent (no flood).
- `src/telegram/` — fetch-based Bot API client and the HTML message formatter.
- `src/index.ts` — poll loop with jitter, heartbeat, graceful SIGTERM. `src/healthcheck.ts` is the
  Docker HEALTHCHECK.

## Invariants

- Reading public listings is fine, at a personal-use rate: sequential requests, one search request
  per search per poll, ≥3 s between detail requests, ≤10 listings per search per poll, polls ≥5
  minutes apart (15 by default). Access matrix and why each site is reached the way it is:
  `docs/access.md`.
- OLX: the owner chose (2026-11-05) to poll it with a stock Playwright Chromium. Keep it stock: no
  stealth plugins, no user-agent/fingerprint/TLS overrides, no `navigator.webdriver` patching, no
  proxies, no CAPTCHA solving. otodom: plain HTTP with the honest `olx-watcher/…` User-Agent from
  `src/sources/http.ts`. If a site starts refusing what works today, report it and stop; do not
  disguise the client or rotate addresses.
- Secrets (`TELEGRAM_BOT_TOKEN`) live only in `.env` (git-ignored) and `/opt/olx-watcher/.env` on
  the server. Never print them, put them in URLs you log, or commit them.
- A listing is sent at most once: mark it seen in the same pass it is sent. Sources must be
  idempotent and safe to retry.
- Totals never invent numbers: unknown parts stay `null` and are listed as "Не указано".
- User-facing message text is Russian; listing content stays as published (Polish).

## Deploy (shared `flotana` VPS)

The app runs on the same Hetzner VPS as Flotana (`ssh flotana`, root, 188.245.184.9, 4 GB RAM,
3 vCPU — Flotana uses about half; keep `mem_limit` at or below 768 MB). Read `docs/deploy.md` before the first
deploy or anything unusual.

- `npm run deploy:production` releases the committed, pushed `main` only: `git archive` →
  `/opt/olx-watcher/releases/<sha>` → `docker compose build` on the server → wait for `healthy` →
  switch `current` symlink; on failure it restores the previous release.
- Isolated compose project `olx-watcher-production`: no host ports, no `public-edge` network, its own
  `data` volume. Never touch `/opt/flotana`, `/opt/rts-partner`, `/opt/wireguard`, their containers,
  networks, Caddyfile, or run `docker system prune`/`docker compose down` for other projects.
- **Where each site runs.** The VPS runs `SOURCES=olx` (Chromium; ~380 MB peak during a poll,
  container limit 768 MB). otodom's CDN refuses every request from the VPS, even to a real
  browser, so otodom runs in GitHub Actions every 15 minutes (`.github/workflows/otodom.yml`,
  `SOURCES=otodom`, SQLite kept in `actions/cache`, secrets `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`, `SEARCH_URLS`). The VPS sets `SKIP_OTODOM_COPIES=1` so OLX copies of otodom
  ads are not sent twice. No runner on the owner's computers. The WireGuard VPN on that server
  (`~/Developer/wireguard`) exits through the same blocked IP; it does not help otodom.
- A one-shot run (`--once`) exits 1 when a search could not be read, so a blocked or changed site
  turns the Actions run red instead of failing silently.

## Git

Conventional commits (`feat: …`, `fix: …`), one logical change per commit. Commit and push to
`main` yourself once `npm run check` passes; deploy only when the user asks.
