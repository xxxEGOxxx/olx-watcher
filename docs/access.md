# Site access

Measured 2026-11-04/05. "Honest client" = plain HTTP with `User-Agent: olx-watcher/0.1 (personal
rental alerts)`. "Browser" = stock Playwright 1.64 headless Chromium, no stealth or overrides.

| Target | Home Mac (residential IP) | `flotana` VPS (Hetzner 188.245.184.9) |
|---|---|---|
| otodom pages, honest client | **200** (`__NEXT_DATA__` has full data) | 403 |
| otodom pages, browser | 403 (HeadlessChrome UA) | 403 |
| otodom other hosts (`/api/query`, `m.`, `api.`), robots.txt | 200 | 403 |
| OLX pages / `api/v1/offers`, honest client | flaky: 200 or 403 depending on the day and HTTP version | 403 (HTTP/1.1 and HTTP/2) |
| OLX in a browser page (`page.evaluate(fetch)`) | **200** | **200** (52 ads in 7 s) |

So: **OLX runs on the server in Chromium; otodom runs in GitHub Actions with the honest client.**

Notes:

- otodom sits behind one CloudFront distribution whose WAF refuses the whole Hetzner range on every
  host and path. It is an address rule, not a client rule: the same request passes from home and
  from other clouds. Open-source bots that read otodom (e.g. `Dotims/overheads`) run from GitHub
  Actions (Azure addresses), which is what this project does too (scheduled "git scraping" of
  public data is a common, GitHub-documented use of Actions); others use paid proxy/scraping
  services, which stay out of scope (AGENTS.md).
- OLX's CloudFront rules change: other projects saw HTTP/1.1 refused while HTTP/2 passed, then the
  reverse. A real browser page is the stable path, and is what the owner chose.
- A plain `curl` UA or a bare `Mozilla/5.0` gets 403 from otodom even at home; the identifying UA
  passes. Do not "improve" this by imitating a browser.
- Only about a quarter of fresh otodom ads are cross-posted to OLX (10 of 37 in a Poznań sample,
  `partner.code = otodom_pl`, `external_url` = the otodom link), so OLX alone does not cover
  otodom. Those copies get the id `otodom:<ID…>` so both runners agree on identity; the server drops
  them with `SKIP_OTODOM_COPIES=1` (the VPS and Actions keep separate databases, so they cannot
  de-duplicate against each other).
- The WireGuard VPN on the VPS exits through the same IP, so it reproduces the server's view and
  does not unblock otodom.

## OLX JSON API (what `src/sources/olx.ts` uses)

Called from a page on `https://www.olx.pl` with same-origin `fetch`, exactly like the web app.

- Friendly path → ids: `GET /api/v1/friendly-links/query-params/nieruchomosci,mieszkania,wynajem,poznan/`
  → `{data:{category_id:15, region_id:1, city_id:13983}}` (cached per runner).
- Search: `GET /api/v1/offers/?offset=0&limit=40&category_id=15&region_id=1&city_id=13983&sort_by=created_at:desc`
  plus the web URL's filters without the `search[...]` wrapper
  (`search[filter_float_price:to]=3000` → `filter_float_price:to=3000`,
  `search[filter_enum_rooms][0]=two` → `filter_enum_rooms[0]=two`, `/q-balkon/` → `query=balkon`).
  Returns `data[]` of full ads (promoted ones mixed in, so up to ~52), `links.next` for paging.
- Ad: `GET /api/v1/offers/<numeric id>/`. Ad pages only show the numeric id in the footer
  (`ID: 1089901642`).
- Ad fields: `id`, `url`, `title`, `description` (HTML), `created_time`, `last_refresh_time`,
  `business` (bool), `partner.code`, `external_url`, `location.city/district`,
  `map.lat/lon/radius/show_detailed` (approximate unless `show_detailed`), `params[]`: `price`
  (`value.value` number), `rent` (czynsz dodatkowo, `value.key` like `"621"`), `m`, `rooms`
  (`one`…`four`), `floor_select`, `furniture`, `pets`, `builttype`, `winda`.

## otodom data (see `test/fixtures/`)

- Search item: `id`, `slug`, `title`, `totalPrice`, `rentPrice`, `areaInSquareMeters`,
  `roomsNumber`, `isPrivateOwner`, `createdAtFirst`, `isPromoted`.
- Ad: `characteristics` with `price`, `rent`, `deposit`, `m`, `rooms_num`, `floor_no`,
  `free_from`; `advertiserType`; `location` with coordinates, `mapDetails.radius` (0 = exact),
  reverse-geocoded city/district/street; `description` HTML (commission and utilities are only in
  this text).

## GitHub Actions limits

- Scheduled runs can start several minutes late or be skipped when GitHub is busy; 15 minutes is
  a target, not a guarantee.
- Each run is billed as at least one minute: every 15 minutes is ~2 900 minutes a month. Public
  repositories have no minute limit; private ones on the Free plan include 2 000 (Pro: 3 000).
- In a public repository, run logs are public: they show the search URLs and listing links.
