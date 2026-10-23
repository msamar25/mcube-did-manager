# v67 — Cloudflare Turnstile for public support form

The public form is served by FastAPI at `/support-request` from `backend/public_request.html` (not from the Svelte SPA).

Set the following environment variables on the **backend Render web service**:

- `TURNSTILE_SITE_KEY` — public site key from your Cloudflare widget
- `TURNSTILE_SECRET_KEY` — private secret key (never commit to Git)
- `TURNSTILE_EXPECTED_HOSTNAME` — the hostname on which the public form is opened, e.g. `your-service.onrender.com`, without scheme/path

Add that same hostname to the Turnstile widget's permitted hostnames in Cloudflare. If you use a custom domain, configure its hostname in both places. Redeploy the backend.

Visit `https://YOUR-BACKEND-HOST/support-request`, complete the widget, then submit. Invalid, missing, expired or reused tokens are rejected by the backend *before any Google Sheets writes*. Token is reset after both success and failure.

Important: The login page currently links to `/support-request` on its own origin. If the frontend and backend are deployed on **different domains**, configure your frontend host to forward `/support-request` to the backend or change the login link to the backend's public form URL. This release does not change the deployment routing.

Verification checks Cloudflare `success` and exact `hostname`; secret and expected hostname are required (fail closed). Keep existing rate limits and employee-directory matching enabled.
