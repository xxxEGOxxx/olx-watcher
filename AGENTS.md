# olx-watcher agent guide

olx-watcher watches rental searches (otodom.pl today; OLX.pl real-estate ads are cross-posted
there) and sends each new listing to the owner's Telegram with
a cost breakdown: rent, czynsz administracyjny, media, kaucja, agency commission (prowizja), monthly
and move-in totals, and a map point. Single-user personal tool. Product notes: `docs/product.md`.

Stack: Node 24 running TypeScript directly (type stripping, no build step), strict ESM, `node:test`,
`node:sqlite`, Biome, npm. Zero runtime dependencies so far; keep it that way unless a dependency
clearly beats ~50 lines of glue (then add it to `dependencies` and mention why in the commit).

## Commands

- `npm ci` once; `npm run check` = Biome + `tsc --noEmit` + tests. Run it before every commit.
- Focused test: `node --test test/costs.test.ts`.
- Local run: `cp .env.example .env`, fill it, `npm run once` (single poll) or `npm run dev`.
- One listing: `npm run parse -- <otodom url>` prints the Telegram message (`--send` delivers it).
- Deploy: `npm run deploy:production` (see "Deploy" below). Ops: `npm run server -- status|logs|
  restart|once|env-push`.

## Layout

- `src/listing.ts` — the normalized `Listing` model and `costBreakdown()`. Every source maps into it.
- `src/description.ts` — Polish free-text heuristics (kaucja, czynsz, media, prowizja). Structured
  source fields win; heuristics only fill gaps. Every new pattern gets a test with a real phrase.
- `src/money.ts` — money is integer grosze. Never add złoty as floats; use `parsePln`/`formatPln`.
- `src/sources/` — `ListingSource` (`search` → refs, `details` → `Listing`), the honest HTTP
  client (`http.ts`) and the otodom parser (`otodom.ts`, reads Next.js `__NEXT_DATA__`). Parser
  tests run on trimmed real payloads in `test/fixtures/`; refresh them when otodom changes layout.
- `src/store.ts` — SQLite de-duplication; first pass of a search is silent (no flood).
- `src/telegram/` — fetch-based Bot API client and the HTML message formatter.
- `src/index.ts` — poll loop with jitter, heartbeat, graceful SIGTERM. `src/healthcheck.ts` is the
  Docker HEALTHCHECK.

## Invariants

- Scraping public listing pages is fine. Do it as an honest client: the `olx-watcher/…`
  User-Agent from `src/sources/http.ts`, sequential requests, ≥3 s between detail pages, ≤10
  details per search per poll, polls ≥5 minutes apart. A 403 means "this network is blocked";
  report it, do not fake a browser (UA/header/TLS impersonation), rotate proxies or solve
  CAPTCHAs. Current access matrix: `docs/access.md`.
- Secrets (`TELEGRAM_BOT_TOKEN`) live only in `.env` (git-ignored) and `/opt/olx-watcher/.env` on
  the server. Never print them, put them in URLs you log, or commit them.
- A listing is sent at most once: mark it seen in the same pass it is sent. Sources must be
  idempotent and safe to retry.
- Totals never invent numbers: unknown parts stay `null` and are listed as "Не указано".
- User-facing message text is Russian; listing content stays as published (Polish).

## Deploy (shared `flotana` VPS)

The app runs on the same Hetzner VPS as Flotana (`ssh flotana`, root, 188.245.184.9, 4 GB RAM,
3 vCPU — Flotana uses about half; keep `mem_limit` small). Read `docs/deploy.md` before the first
deploy or anything unusual.

- `npm run deploy:production` releases the committed, pushed `main` only: `git archive` →
  `/opt/olx-watcher/releases/<sha>` → `docker compose build` on the server → wait for `healthy` →
  switch `current` symlink; on failure it restores the previous release.
- Isolated compose project `olx-watcher-production`: no host ports, no `public-edge` network, its own
  `data` volume. Never touch `/opt/flotana`, `/opt/rts-partner`, `/opt/wireguard`, their containers,
  networks, Caddyfile, or run `docker system prune`/`docker compose down` for other projects.
- **The server's IP is blocked by otodom and OLX (CloudFront 403 on every URL, even robots.txt).**
  A watcher deployed there runs but every search fails with `BlockedError`. Where polling should
  run is an open decision in `docs/access.md`. The WireGuard VPN on that server
  (`~/Developer/wireguard`) routes a Mac out through the same blocked IP, so it reproduces the
  server's view; it does not unblock anything.

## Git

Conventional commits (`feat: …`, `fix: …`), one logical change per commit. Commit and push to
`main` yourself once `npm run check` passes; deploy only when the user asks.
