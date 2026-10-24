#!/usr/bin/env bash
# Installs the agent factory on this Mac: a frozen copy of the dispatcher (so neither a branch
# switch nor the implementer can change the running code) and a launchd job.
#   install.sh            copy the app and write the launchd job, but do not start it
#   install.sh --load     ...and start it: one dispatch every 5 minutes
#   install.sh --unload   stop it and remove the launchd job
set -euo pipefail

LABEL=com.marketcore.agent-factory
FACTORY_HOME="${FACTORY_HOME:-$HOME/.agent-factory/marketcore}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SOURCE_DIR/../.." && pwd)"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "--unload" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Stopped and removed $LABEL. The app, clones and logs in $FACTORY_HOME are kept."
  exit 0
fi

# launchd starts jobs with a bare PATH; give it the directories of every tool the factory runs.
path_dirs=()
for tool in node pnpm gh git opencode caffeinate osascript; do
  location="$(command -v "$tool")" || { echo "missing: $tool" >&2; exit 1; }
  path_dirs+=("$(dirname "$location")")
done
JOB_PATH="$(printf '%s\n' "${path_dirs[@]}" /usr/bin /bin /usr/sbin /sbin | awk '!seen[$0]++' | paste -sd: -)"

mkdir -p "$FACTORY_HOME/app" "$(dirname "$PLIST")"
cp "$SOURCE_DIR"/{config,policy,github,dispatch}.mjs "$SOURCE_DIR"/{opencode.json,prompt.md} "$FACTORY_HOME/app/"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$FACTORY_HOME/app/dispatch.mjs</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$JOB_PATH</string>
    <key>FACTORY_HOME</key><string>$FACTORY_HOME</string>
    <key>FACTORY_REPO_DIR</key><string>$REPO_DIR</string>
  </dict>
  <key>StandardOutPath</key><string>$FACTORY_HOME/dispatch.log</string>
  <key>StandardErrorPath</key><string>$FACTORY_HOME/dispatch.log</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null

echo "Installed the app in $FACTORY_HOME/app and wrote $PLIST"
if [[ "${1:-}" == "--load" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST"
  echo "Started: a dispatch every 5 minutes. Log: $FACTORY_HOME/dispatch.log"
else
  echo "Not started. Run again with --load to start it."
fi
