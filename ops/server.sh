#!/usr/bin/env bash
# Day-to-day operations for olx-watcher on the shared `flotana` VPS (read-mostly).
set -euo pipefail

readonly target="${OLX_DEPLOY_SSH_TARGET:-flotana}"
readonly root="${OLX_DEPLOY_ROOT:-/opt/olx-watcher}"
readonly compose="cd $root/current && OLX_ENV_FILE=$root/.env OLX_IMAGE_TAG=\$(basename \$(readlink -f $root/current)) docker compose -p olx-watcher-production -f docker-compose.yml"

case "${1:-help}" in
  env-push)
    # Uploads the local .env as the server-only production config.
    [[ -f .env ]] || { echo "No .env — copy .env.example first" >&2; exit 1; }
    ssh "$target" "install -d -m 0700 $root"
    scp -q .env "$target:$root/.env"
    ssh "$target" "chmod 600 $root/.env"
    echo "Uploaded .env to $target:$root/.env (restart to apply: npm run server -- restart)"
    ;;
  status) ssh "$target" "$compose ps && readlink -f $root/current" ;;
  logs) ssh -t "$target" "$compose logs -f --tail=100 watcher" ;;
  restart) ssh "$target" "$compose up -d --force-recreate watcher" ;;
  once) ssh "$target" "$compose run --rm watcher node src/index.ts --once" ;;
  *)
    echo "Usage: npm run server -- <env-push|status|logs|restart|once>"
    ;;
esac
