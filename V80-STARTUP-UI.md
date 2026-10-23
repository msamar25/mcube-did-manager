# v80 — White startup screen
- White/orange responsive startup UI with real frontend-mounted and backend `/api/health` states.
- Retry button after connection failures; no fake progress bars.
- User-requested Lottie animation loaded from assets5.lottiefiles.com through lottie-web CDN; CSS spinner fallback when external services are unavailable.
- Existing Svelte success/error toast notifications remain unchanged.
- No backend or cron behavior changed.
## Deploy
Upload extracted files to GitHub main and redeploy Render Static Site. No new environment variables. Test dashboard and /support-request.
## Note
The loader verifies backend health, not completion of every dashboard API request.
