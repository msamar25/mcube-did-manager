# v12 Inventory Fix

This patch corrects the `display_inventory()` undefined `r` error and safely handles MCube duplicate DID rows.

- Exact repeated DID assignments within the same category are consolidated.
- Conflicting assignments or DIDs appearing in multiple categories stop the import.
- An unsuccessful import does not overwrite Google Sheets snapshots.
- Existing authentication, Brevo, Settings and operation locking are unchanged.

## Deploy
Copy the contents of this folder to the root of the GitHub repository; commit and push; wait for Render to deploy. Log in and click **Import MCube DID inventory**. Inspect Render logs if a conflicting DID error remains. Never turn on automatic replacement until the inventory is verified.
