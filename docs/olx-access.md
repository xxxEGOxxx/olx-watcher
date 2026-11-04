# OLX access — open decision

## What was measured (2026-11-04)

| From | Request | Result |
|---|---|---|
| `flotana` VPS (Hetzner, 188.245.184.9) | `GET https://www.olx.pl/api/v1/offers/…` | 403 CloudFront "Request blocked" |
| `flotana` VPS | `GET` a search page `/nieruchomosci/mieszkania/wynajem/warszawa/` | 403 |
| Home Mac (residential IP) | same API and search page with curl | 403 |
| `flotana` VPS | `GET https://www.otodom.pl/` | 403 |

OLX blocks automated HTTP clients regardless of IP, so the VPN does not help either. Getting past
this by faking a browser fingerprint, rotating proxies or solving challenges is bot-detection
evasion and is out of scope for this project (see AGENTS.md invariants).

## Candidate sources (pick one, then implement it as a `ListingSource`)

1. **OLX saved-search e-mail alerts → IMAP.** In OLX, save the search and enable notifications;
   alerts arrive in a mailbox (a dedicated Gmail with an app password, read over IMAP). The source
   parses the alert e-mail (title, price, link, sometimes thumbnail). Detail fields (czynsz, kaucja,
   map point) then need the listing page, which is blocked — so the message would carry what the
   e-mail has plus heuristics. Sanctioned, robust, slight delay.
2. **OLX Partner API (developer.olx.pl).** Official OAuth API. Mostly for managing your own adverts;
   check whether search/read of public adverts is granted for a personal app before relying on it.
3. **Manual/semi-manual: the user forwards a listing link or text to the bot.** The bot can only
   use what the user pastes (text/screenshot) since fetching the page is blocked. A free Gemini key
   could extract the fields from pasted text; paid LLM APIs need the user's OK first.
4. **Run in the user's own browser** (e.g. a userscript/extension that reads search pages the user
   opens and posts new ads to the bot). Normal human browsing, no evasion; only works while the
   browser is open.

Until a decision lands, `OLX_SOURCE=none` keeps the service healthy and idle.

## When implementing

- Save one real response (e-mail, API JSON) under `test/fixtures/` with personal data removed and
  write the normalizer test against it first.
- Map structured fields first (price, czynsz/`rent` param, area, rooms, business flag, map
  lat/lon + whether it is approximate), then fill gaps with `extractDescriptionCosts()`.
- Ids are `<source>:<native id>` and must be stable across polls.
