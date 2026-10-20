# v18 — automatic session-expiry logout

- On an authenticated API HTTP 401, clear the expired browser session and return to the PIN + OTP login screen.
- Check the signed session expiry before API requests and every 15 seconds while the application is open.
- Never automatically replay MCube DID mutations after an authorization failure.
- After successful login, reload Dashboard, role and requests. The selected page remains in browser state.
- HTTP 500/502/503 errors remain visible and do not cause logout.
- No refresh-token endpoint was added: the existing backend only issues eight-hour OTP-authenticated sessions. Silent extension would require a separately secured refresh mechanism.
