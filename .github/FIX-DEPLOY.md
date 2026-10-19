# MCube DID Manager — inventory diagnostics and settings confirmation

Changes:
- Reject unknown MCube DID response formats with sanitized response-key diagnostics (never log raw tokens or full response bodies).
- Recognize additional common DID list wrappers while refusing to treat unknown responses as empty inventory.
- Handle non-JSON HTTP 500/502 responses in frontend without a JavaScript JSON parsing error.
- Show error/success banners on every tab, including Settings.
- After saving settings, read them back and compare the version before confirming success.
- Refresh button now shows the actual backend sync error, not a generic JSON parsing error.

Deploy: Extract ZIP, copy contents of `mcube-did-manager` to the root of the GitHub repo, commit and push, and deploy latest commit on Render. Existing environment variables remain unchanged.

Check Render logs after Refresh; if response schema is not recognized, the error includes safe top-level keys only. Do not paste raw MCube responses or credentials in public messages.

Caution: Unknown MCube response shape and external MCube API behavior cannot be verified offline. Live API integration, Google Sheets persistence, and frontend production build still require testing. Do not run DID replacements or automatic calls until inventory and settings are confirmed.
