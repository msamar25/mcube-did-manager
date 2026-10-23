#!/usr/bin/env bash
set -euo pipefail
: "${BACKEND_PUBLIC_URL:?Set BACKEND_PUBLIC_URL to the Render FastAPI URL}"
cd frontend
npm install --no-audit --no-fund
node -e '''const fs=require("fs");const url=(process.env.BACKEND_PUBLIC_URL||"").trim().replace(/\/+$/,"");if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(url)){throw Error("Invalid BACKEND_PUBLIC_URL")}fs.writeFileSync("public/runtime-config.js","window.UNEXT_API_BASE = "+JSON.stringify(url)+";\n")'''
npm run build
