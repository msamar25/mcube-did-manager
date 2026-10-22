# V21: employee directory matching

- MCube `emp-filter` requests roles `2`, `3`, `4`, `5` with the supplied payload fields and a fresh config-login token.
- Employee response parsing supports nested wrappers, but refuses unrecognized/empty responses and preserves the prior directory.
- Inbound `callto` must match an unambiguous employee phone **and** an unambiguous active DID assignment. This intentionally excludes employee-only numbers with no active DID, as replacement would otherwise be unsafe.
- The request DID, inbound/cancel filters, call ID deduplication, existing review and replacement safeguards remain unchanged.
- After deployment run Employee Sync before Call Sync; previously stored requests are not retroactively reclassified.
