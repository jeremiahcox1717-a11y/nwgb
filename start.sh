#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet. Get the LTS build from https://nodejs.org then run this again."
  exit 1
fi
echo "Installing..."
npm install || exit 1
echo
echo "Open this in your browser:  http://localhost:3000"
echo "Leave this window open while you use the desk."
echo
(sleep 2 && (xdg-open "http://localhost:3000" >/dev/null 2>&1 || open "http://localhost:3000" >/dev/null 2>&1 || true)) &
npm start
