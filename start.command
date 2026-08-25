#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  open "https://nodejs.org"
  osascript -e 'display dialog "Node.js is not installed yet. Install the LTS version from the page that just opened, then double-click start.command again." buttons {"OK"} default button 1' >/dev/null 2>&1 || true
  exit 1
fi
echo "Installing..."
npm install || exit 1
echo
echo "Open this in your browser:  http://localhost:3000"
echo "Leave this window open while you use the desk."
echo
(sleep 2 && open "http://localhost:3000") &
npm start
