# UNext SupportHub v49

- Rebranded frontend, document title, OTP email subject and API title.
- UNext logo displayed by URL (requires browser access to the logo host).
- Login hero uses animated education icons instead of waving emoji. Reduced-motion supported.
- Profile dropdown uses avatar and Settings/Sign out icons. Operator does not see Settings.
- Operator account: set OPERATOR_EMAIL and OPERATOR_PIN_HASH in Render (or OPERATOR_USERS_JSON for multiple accounts). Email OTP still required. Operator navigation is Request and Report only. Admin-only direct DID inventory reassignment and Settings remain restricted.
- Admin-only Settings actions: Sync inventory and Clear inventory snapshots. Clearing requires two confirmations, refuses if replacement recovery is unresolved, preserves Change_Logs, Operation_Queue, request records, employee directory, history and settings. It is intentionally NOT a button to erase every Google Sheet tab; deleting the audit trail would make replacement recovery unsafe.
- All new application-generated timestamps already use timezone-aware Asia/Kolkata (+05:30), including request, employee, notification, sync and audit timestamps. Legacy *_utc column headers remain unchanged for existing integrations; old rows are NOT mass-converted to avoid corrupting history. Source provider timestamps are converted to IST for new call records.
- Existing roles and credential hashes are NOT embedded. To create an operator PIN hash:

```
python - <<'PY'
import hashlib,secrets,getpass
pin=getpass.getpass('Operator PIN: ')
salt=secrets.token_bytes(16); iterations=260000
print('pbkdf2_sha256$%d$%s$%s'%(iterations,salt.hex(),hashlib.pbkdf2_hmac('sha256',pin.encode(),salt,iterations).hex()))
PY
```

Set OPERATOR_EMAIL and OPERATOR_PIN_HASH in Render. Set up Brevo and SESSION_SECRET as before. A real account cannot be provisioned until these are configured.

Validation: backend compiled; frontend npm dependency install timed out, so production build/browser test not verified.
