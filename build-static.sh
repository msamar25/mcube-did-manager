#!/usr/bin/env bash
set -euo pipefail
: "${BACKEND_PUBLIC_URL:?Set BACKEND_PUBLIC_URL to the Render FastAPI URL}"
cd frontend
npm install --no-audit --no-fund
printf 'window.UNEXT_API_BASE=%s;\n' "$(python3 -c 'import json,os;print(json.dumps(os.environ["BACKEND_PUBLIC_URL"].rstrip("/")))')" > public/runtime-config.js
npm run build
