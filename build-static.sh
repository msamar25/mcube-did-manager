#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_PUBLIC_URL:?Set BACKEND_PUBLIC_URL to the Render FastAPI URL}"

cd frontend

# Install dependencies
npm ci --no-audit --no-fund

# Generate clean runtime configuration using Node.js
node -e '
const fs = require("fs");

const url = (process.env.BACKEND_PUBLIC_URL || "").trim().replace(/\/+$/, "");

if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(url)) {
  console.error("Invalid BACKEND_PUBLIC_URL:", url);
  process.exit(1);
}

fs.writeFileSync(
  "public/runtime-config.js",
  "window.UNEXT_API_BASE = " + JSON.stringify(url) + ";\n",
  "utf8"
);

console.log("Runtime configuration generated successfully");
'

# Build Svelte frontend
npm run build

echo "Static frontend build completed successfully"