---
name: deploy
description: Release olx-watcher to the shared flotana VPS, check its status or logs, push its .env, or diagnose a failed release. Use for "задеплой", "выкати", "что на сервере", "логи бота". Not for Flotana or other projects on the same server.
---

# olx-watcher deploy

Sources of truth: `ops/deploy/production.sh` (release), `ops/server.sh` (operations),
`docs/deploy.md` (runbook), `docker-compose.yml` (topology).

## Release

Only when the user asked to deploy.

1. `npm run check` passes and the tree is committed on `main`.
2. `git push origin main` (the script requires `main == origin/main`).
3. `ssh flotana 'test -f /opt/olx-watcher/.env'` — if missing, ask the user to fill `.env` and run
   `npm run server -- env-push`; never invent or echo token values.
4. `npm run deploy:production` in the background; follow its output. It builds on the server,
   waits for `healthy`, and rolls back on failure. Never rerun on failure before reading the logs.
5. Report the release sha and the last log lines. `npm run server -- status` confirms.

## Diagnosis (read-only first)

```bash
npm run server -- status
ssh flotana 'cd /opt/olx-watcher/current && OLX_ENV_FILE=/opt/olx-watcher/.env OLX_IMAGE_TAG=$(basename $(pwd -P)) docker compose -p olx-watcher-production logs --tail=100 watcher'
```

## Never

- Touch `/opt/flotana`, `/opt/rts-partner`, `/opt/wireguard`, their containers, networks or Caddy.
- `docker system prune`, delete the `olx-watcher-production_data` volume, or download/print
  `/opt/olx-watcher/.env`.
- Work around OLX's 403 (header/fingerprint spoofing, proxies, CAPTCHA solving).
