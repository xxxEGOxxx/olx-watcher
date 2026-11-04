# Deploy runbook

## Server

| | |
|---|---|
| SSH | `ssh flotana` (`~/.ssh/config`: root@188.245.184.9, key `~/.ssh/hetzner`) |
| Provider | Hetzner Cloud, 3 vCPU, 3.7 GB RAM, no swap, 75 GB disk (~77% used in Nov 2026) |
| Neighbours | `/opt/flotana` (Flotana prod + Caddy on 80/443), `/opt/rts-partner`, `/opt/wireguard` (wg-easy, UDP 51820) |
| This app | `/opt/olx-watcher`, compose project `olx-watcher-production` |

```
/opt/olx-watcher/
  .env                    # server-only config (chmod 600), uploaded with `npm run server -- env-push`
  releases/<git sha>/     # git archive of each release (last 5 kept)
  current -> releases/…   # live release
  previous -> releases/…  # rollback target
```

SQLite and the heartbeat live in the Docker volume `olx-watcher-production_data` and survive
releases. Do not delete it: it is the "already sent" memory; losing it re-warms searches silently
(no duplicates are sent, but listings posted during the gap are skipped).

## First deploy

1. Create a bot with @BotFather, get your chat id (e.g. @userinfobot), fill `.env` from
   `.env.example`. On the server: `SOURCES=olx`, `SEARCH_URLS` (OLX searches; otodom ones are
   ignored there), `SKIP_OTODOM_COPIES=1` (otodom comes from GitHub Actions).
2. `npm run server -- env-push`
3. Commit, push `main`, then `npm run deploy:production`.
4. `npm run server -- logs` — expect `started`, then `search warmed` on the first poll and
   `search polled` afterwards.
5. otodom: set the repository secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SEARCH_URLS`
   (`gh secret set …`), then `gh workflow run otodom` and check `gh run list -w otodom`.

## Ordinary release

```bash
npm run check
git push origin main
npm run deploy:production
```

The script refuses a dirty tree, a branch other than `main`, or `main` that differs from
`origin/main`. It waits up to 5 minutes for the container healthcheck (heartbeat written after each
poll cycle, unhealthy if older than 3 poll intervals) and rolls back automatically on failure.

## Operations

```bash
npm run server -- status     # compose ps + current release
npm run server -- logs       # follow logs
npm run server -- restart    # re-read .env
npm run server -- once       # one extra poll in a throwaway container
npm run server -- env-push   # upload local .env (then restart)
```

Manual rollback: `ssh flotana`, `cd /opt/olx-watcher/previous`, then
`OLX_ENV_FILE=/opt/olx-watcher/.env OLX_IMAGE_TAG=$(basename $(pwd -P)) docker compose -p olx-watcher-production up -d watcher`
and re-point `current`.

## Egress

OLX answers this VPS to a stock headless Chromium (the image ships Playwright's headless shell;
measured 52 ads in 7 s, ~380 MB peak, inside the hardened container). otodom refuses every request
from this IP, browser or not, so otodom is polled by GitHub Actions (`.github/workflows/otodom.yml`). A
`search failed … answered 403` line from OLX means its rules changed: report it, do not disguise
the browser (`docs/access.md`).

## VPN

`~/Developer/wireguard` runs wg-easy on the same server (full tunnel). Connect from the Mac with
`sudo wg-quick up ~/Developer/wireguard/clients/mac.conf`; `curl https://api.ipify.org` then shows
`188.245.184.9`. Use it to reproduce what the server sees. It does not unblock otodom: the VPN exits
through the blocked server IP. Never modify the wireguard project from here.
