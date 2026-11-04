# Site access

All checks below use the project's honest client (`User-Agent: olx-watcher/0.1 (personal rental
alerts)`, no browser headers), measured 2026-11-04/05.

| Target | Home Mac (residential IP) | `flotana` VPS (Hetzner 188.245.184.9) |
|---|---|---|
| otodom search page `/pl/wyniki/wynajem/...` | **200**, 36 ads + pagination in `__NEXT_DATA__` | 403 |
| otodom ad page `/pl/oferta/...` | **200**, full ad in `__NEXT_DATA__` | 403 |
| otodom `robots.txt` | 200 (search and ad pages allowed) | 403 |
| OLX ad page `/d/oferta/...` | GET 403, HEAD 200 | GET 403, HEAD 200 |
| OLX search page / `api/v1/offers` | GET 403, HEAD 200 | GET 403, HEAD 200 |

Notes:

- Plain `curl` (UA `curl/x`) or a bare `Mozilla/5.0` gets 403 from home too; the honest
  identifying UA is what passes. Do not "improve" this by imitating a browser.
- OLX does not block the VPS IP (HEAD answers 200 from both networks); its CloudFront rule
  rejects every GET that does not come from a real browser. Driving a browser (Playwright,
  headless or not) to get past that rule was stopped by the agent's safety check as bot-detection
  circumvention, so it is not used unless the owner explicitly decides otherwise.
- OLX real-estate ads from agencies and many private owners
  are cross-posted to otodom (`isCrossListed`); ads posted only on OLX are not covered.
- The datacenter block applies to the whole VPS IP, so the WireGuard VPN on that server does not
  help: it exits through the same IP.

## What otodom gives (see `test/fixtures/`)

- Search item: `id`, `slug`, `title`, `totalPrice`, `rentPrice` (czynsz), `areaInSquareMeters`,
  `roomsNumber`, `isPrivateOwner`, `createdAtFirst`, `isPromoted`.
- Ad: `characteristics` with `price`, `rent` (czynsz administracyjny), `deposit` (kaucja), `m`,
  `rooms_num`, `floor_no`, `free_from`; `advertiserType` (`private`/`business`); `location` with
  coordinates, `mapDetails.radius` (0 = exact point), reverse-geocoded city/district/street;
  `description` HTML (commission and utilities are only ever in this text).

## What OLX gives inside a browser (checked by hand in a normal browser tab, 2026-11-05)

The OLX web app itself calls a JSON API that returns complete ads, so one request per poll would be
enough if it were reachable:

- Search: `GET /api/v1/offers/?offset=0&limit=40&category_id=15&region_id=1&city_id=13983&sort_by=created_at:desc`
  (category 15 = mieszkania/wynajem, region 1 = Wielkopolskie, city 13983 = Poznań) → `data[]` of
  full ads, `links.next` for paging. Sorting follows `last_refresh_time`, so refreshed ads come back
  on top (id de-duplication handles it). Promoted ads are mixed in.
- Ad: `GET /api/v1/offers/<id>/` → same object.
- Ad fields: `id`, `url`, `title`, `description` (HTML), `created_time`, `last_refresh_time`,
  `business` (bool), `partner.code` (`otodom_pl` when cross-posted), `location.city/district`,
  `map.lat/lon/radius/show_detailed` (approximate unless `show_detailed`), `params[]` with keys
  `price` (`value.value` number), `rent` (czynsz dodatkowo, `value.key` string like `"621"`), `m`,
  `rooms` (`one`, `two`...), `floor_select`, `furniture`, `pets`, `builttype`.

## Open decision: where polling runs

The VPS cannot fetch. Options:

1. **Run the watcher at home**: on the Mac as a `launchd` agent (polls only while the Mac is
   awake), or on an always-on home device (Raspberry Pi, NAS, router with Docker). Same code and
   Docker image; the server is not involved.
2. **Keep the server for Telegram, fetch at home**: a small home agent fetches and pushes parsed
   listings to the server bot. More moving parts; only worth it once the bot gets interactive
   features (commands, filters) that should stay online.
3. **Manual links**: the bot accepts a listing link and replies with the breakdown. Still needs a
   fetch from an unblocked network, so it inherits the same constraint.

Routing the server's requests through a home connection or a proxy service to get around the
datacenter block is out of scope (see AGENTS.md).
