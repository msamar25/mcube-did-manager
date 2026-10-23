# V71: Public form mobile layout

- Public form is responsive: desktop two-column employee name/mobile, single-column fields on phones <=600px.
- Mobile input font size 16px prevents iOS Safari input focus zoom.
- Touch-friendly 44px inputs, 46px full-width submit, and responsive CAPTCHA container.
- Compact spacing and shorter issue field to reduce unnecessary vertical scrolling.
- Kept server-side Turnstile verification, directory matching, and request logging unchanged.
- No frontend build changes; public form is served from backend/public_request.html.
