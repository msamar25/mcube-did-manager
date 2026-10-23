# v68 — Public request form + Turnstile repair

- Root cause of screenshot: empty `TURNSTILE_SITE_KEY` on FastAPI Render service, so Turnstile received an empty `sitekey`.
- Backend now injects the site key as safely JSON-encoded text. If absent, the page shows a clear error instead of a blank CAPTCHA.
- Explicit Turnstile rendering, error handling, and guarded reset by widget ID. No reset attempted until successfully rendered.
- Compact responsive form with side-by-side name and mobile fields on desktop, reduced padding and textarea height.
- Submit disabled until successful Turnstile verification. Backend continues to verify Cloudflare response and hostname before writes.

## Render setup
Set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME` in the **backend web service** Environment tab, then redeploy. `TURNSTILE_EXPECTED_HOSTNAME` is the hostname where `/support-request` is loaded (no protocol or path). Add that hostname in Cloudflare Turnstile Allowed Hostnames.

Open `https://YOUR-BACKEND-HOST/support-request` and hard-refresh. The public form is served by FastAPI; adding `VITE_TURNSTILE_SITE_KEY` to a separate frontend service will not configure it.
