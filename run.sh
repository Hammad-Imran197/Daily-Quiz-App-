#!/usr/bin/env bash
# Starts Daily Quiz + an HTTPS tunnel and prints the shareable URL.
# Prefers the systemd user services (auto-start on boot, auto-restart on crash).
# Usage: ./run.sh
set -e
cd "$(dirname "$0")"

if [ -f "$HOME/.config/systemd/user/daily-quiz.service" ]; then
  echo "🚀 Starting via systemd (auto-restarts on crash, starts on boot)…"
  systemctl --user start daily-quiz daily-quiz-tunnel
  sleep 2
  echo "Server:  $(systemctl --user is-active daily-quiz) on http://localhost:3000"
  echo "Tunnel:  $(systemctl --user is-active daily-quiz-tunnel)"
  URL=$(journalctl --user -u daily-quiz-tunnel -n 200 --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
  echo
  echo "🌐 Shareable HTTPS link:"
  echo "   ${URL:-not found yet — try: systemctl --user restart daily-quiz-tunnel}"
  echo
  echo "Manage:  systemctl --user stop daily-quiz daily-quiz-tunnel"
  echo "Status:  systemctl --user status daily-quiz"
  exit 0
fi

# Manual fallback (no systemd units installed)
if ! curl -s -m 2 http://localhost:3000/api/health > /dev/null 2>&1; then
  nohup node server.js > /tmp/daily-quiz-server.log 2>&1 &
  echo "✅ Server started on http://localhost:3000"
  sleep 1
else
  echo "✅ Server already running"
fi

echo "🌐 Starting HTTPS tunnel — share the link it prints below (Ctrl+C to stop):"
echo
exec cloudflared tunnel --url http://localhost:3000
