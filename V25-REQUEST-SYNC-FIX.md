# v25 Request Sync Fix

- MCube `filter-inbound` and `emp-filter` POST requests now send a JSON string body with `application/x-www-form-urlencoded; charset=UTF-8`, matching the supplied browser cURL.
- Fresh MCube config login JWT is still requested for every config API invocation.
- Response requires `clicktocall` array; pagination and saved request DID retained.
- Request Sync returns non-sensitive skip reason counts (status, employee missing, no unique active DID, duplicate call ID, invalid timestamp). UI displays diagnostics after syncing.
- Supports `inbound`/`incoming` and `cancel`/`cancelled`/`canceled`.
- Does not bypass employee + unique active DID verification or automatically perform replacements.
- Live MCube and Google Sheets operations require deployment testing.
