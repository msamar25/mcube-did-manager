#!/usr/bin/env bash
# Build the new SupportHub UI (frontend-next) as a Render Static Site that talks to the existing backend.
# Render Static Site settings: Build command `bash build-static-next.sh`, Publish directory `frontend-next/dist`,
# env BACKEND_PUBLIC_URL=https://YOUR-BACKEND.onrender.com . Then add this site's URL to the backend's
# STATIC_FRONTEND_ORIGINS (comma-separated, keep the existing site). See V87-NEW-UI-GO-LIVE.md.
set -euo pipefail
: "${BACKEND_PUBLIC_URL:?Set BACKEND_PUBLIC_URL to the Render FastAPI URL}"
cd frontend-next
npm install --no-audit --no-fund
node -e '''const fs=require("fs");const url=(process.env.BACKEND_PUBLIC_URL||"").trim().replace(/\/+$/,"");if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(url)){throw Error("Invalid BACKEND_PUBLIC_URL")}fs.writeFileSync("public/runtime-config.js","window.UNEXT_API_BASE = "+JSON.stringify(url)+";\n")'''
node tests/calc.test.mjs
VITE_DATA_MODE=live npm run build
