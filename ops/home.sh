#!/usr/bin/env bash
# Home runner for otodom on this Mac (launchd). otodom's CDN refuses every datacenter address,
# including the flotana VPS, but answers a home connection. The server keeps polling OLX.
# Polls only while the Mac is awake; uses .env.home (chmod 600, never committed).
set -euo pipefail

readonly label="pl.olx-watcher.home"
readonly plist="$HOME/Library/LaunchAgents/$label.plist"
readonly project="$(cd "$(dirname "$0")/.." && pwd)"
readonly env_file="$project/.env.home"
readonly data_dir="$HOME/Library/Application Support/olx-watcher"
readonly log_file="$HOME/Library/Logs/olx-watcher.log"
readonly node_bin="$(command -v node)"

case "${1:-help}" in
  install)
    [[ -f "$env_file" ]] || { echo "No .env.home — copy .env.example and set SOURCES=otodom" >&2; exit 1; }
    [[ "$("$node_bin" -v)" == v24.* ]] || { echo "Node 24 is required on PATH (got $("$node_bin" -v))" >&2; exit 1; }
    chmod 600 "$env_file"
    mkdir -p "$data_dir" "$(dirname "$plist")" "$(dirname "$log_file")"
    cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_bin</string>
    <string>--env-file=$env_file</string>
    <string>$project/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$project</string>
  <key>EnvironmentVariables</key>
  <dict><key>DATA_DIR</key><string>$data_dir</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$log_file</string>
  <key>StandardErrorPath</key><string>$log_file</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    echo "Installed $label (logs: $log_file)"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    rm -f "$plist"
    echo "Removed $label (data kept in $data_dir)"
    ;;
  status) launchctl print "gui/$(id -u)/$label" | grep -E "state|pid|last exit" || echo "not installed" ;;
  logs) tail -n 100 -f "$log_file" ;;
  once) "$node_bin" --env-file="$env_file" "$project/src/index.ts" --once ;;
  *) echo "Usage: npm run home -- <install|uninstall|status|logs|once>" ;;
esac
