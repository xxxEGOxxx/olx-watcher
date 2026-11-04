#!/usr/bin/env bash
# Release the pushed `main` of olx-watcher to the shared `flotana` VPS.
# Pattern borrowed from ~/Developer/rts-partner: git archive -> build on server -> health -> rollback.
set -euo pipefail

readonly deploy_ssh_target="${OLX_DEPLOY_SSH_TARGET:-flotana}"
readonly deploy_root="${OLX_DEPLOY_ROOT:-/opt/olx-watcher}"
readonly compose_project="olx-watcher-production"
readonly keep_releases=5

require_command() {
  command -v "$1" >/dev/null 2>&1 || { printf 'Required command is missing: %s\n' "$1" >&2; exit 1; }
}
require_command git
require_command ssh

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

[[ "$(git branch --show-current)" == "main" ]] || { printf 'Deploy from main.\n' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { printf 'Commit or discard local changes first.\n' >&2; exit 1; }

git fetch --quiet origin main
release_sha="$(git rev-parse HEAD)"
if [[ "$(git rev-parse origin/main)" != "$release_sha" ]]; then
  printf 'Local main must exactly match origin/main.\n' >&2
  exit 1
fi

ssh -o BatchMode=yes -o ConnectTimeout=10 "$deploy_ssh_target" true ||
  { printf 'Unable to connect to %s.\n' "$deploy_ssh_target" >&2; exit 1; }

release_dir="$deploy_root/releases/$release_sha"
git archive --format=tar HEAD | ssh "$deploy_ssh_target" \
  "install -d -m 0755 '$release_dir' && tar -xf - -C '$release_dir'"

ssh "$deploy_ssh_target" bash -s -- \
  "$deploy_root" "$release_dir" "$release_sha" "$compose_project" "$keep_releases" <<'REMOTE'
set -euo pipefail
readonly deploy_root="$1" release_dir="$2" release_sha="$3" compose_project="$4" keep_releases="$5"
export OLX_ENV_FILE="$deploy_root/.env"

if [[ ! -f "$OLX_ENV_FILE" ]]; then
  printf 'Missing %s — upload it with: npm run server -- env-push\n' "$OLX_ENV_FILE" >&2
  exit 1
fi

previous_release=""
[[ -L "$deploy_root/current" ]] && previous_release="$(readlink -f "$deploy_root/current")"

compose=(docker compose -p "$compose_project" -f docker-compose.yml)
rollback() {
  if [[ -n "$previous_release" && "$previous_release" != "$release_dir" ]]; then
    cd "$previous_release"
    OLX_IMAGE_TAG="$(basename "$previous_release")" "${compose[@]}" up -d --remove-orphans watcher
    printf 'Rolled back to %s\n' "$(basename "$previous_release")" >&2
  fi
}

cd "$release_dir"
export OLX_IMAGE_TAG="$release_sha"
"${compose[@]}" build --pull watcher
"${compose[@]}" up -d --remove-orphans watcher

container_id="$("${compose[@]}" ps -q watcher)"
for attempt in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  [[ "$health" == "healthy" ]] && break
  if [[ "$health" == "unhealthy" || "$health" == "exited" || "$attempt" == "60" ]]; then
    docker logs --tail 100 "$container_id" >&2 || true
    rollback
    exit 1
  fi
  sleep 5
done

[[ -n "$previous_release" ]] && ln -sfn "$previous_release" "$deploy_root/previous"
ln -sfn "$release_dir" "$deploy_root/current"

# Keep the newest releases (and their images); never touch the data volume.
current="$(readlink -f "$deploy_root/current")"
previous="$(readlink -f "$deploy_root/previous" 2>/dev/null || true)"
ls -1dt "$deploy_root"/releases/*/ | tail -n +"$((keep_releases + 1))" | while read -r old; do
  old="${old%/}"
  [[ "$old" == "$current" || "$old" == "$previous" ]] && continue
  docker image rm "olx-watcher:$(basename "$old")" >/dev/null 2>&1 || true
  rm -rf -- "$old"
done

docker logs --tail 5 "$container_id"
printf 'Deployed olx-watcher release %s\n' "$release_sha"
REMOTE
