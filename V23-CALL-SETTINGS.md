# V23 — Configurable request DID and outbound call routing

- Admin Settings > MCube and request intake: Request DID is editable, stored in Google Sheets, default 8071439545 for **new** installations. Existing App_Settings values take precedence; edit and save the field to migrate.
- Admin Settings > Outbound call notifications: Level 1 and Level 2 each have exenumber and custnumber. Toggle queue calls per level. The outbound-calls endpoint continues using the fixed MCUBE_BEARER_TOKEN (not the config login JWT).
- Agent completion calls: exenumber is the agent number from the verified active DID assignment; custnumber is configurable (defaults to request DID).
- Reminders route through Level 1/Level 2 settings. All calls are opt-in; calls may have charges and the API reports initiation only, not delivery.
- Test first with approved numbers. Avoid re-triggering queue sync while validating; deduplication is by callid.
- The earlier Google Sheets setting keys are retained for compatibility.
- JWTs and credentials must not be committed to source control.
