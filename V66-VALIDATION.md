# v66 — Public request identity validation

- Server-side Indian mobile format check (6–9 prefix, 10 digits), rejects obvious dummy patterns.
- Server-side employee email syntax check and common sample/disposable email checks.
- **Fail closed** when Employee_Directory has no registered email or name; submitted values must match both registered values and the active DID phone mapping.
- Browser provides immediate validation feedback; server is authoritative.
- Does not verify ownership of a phone/email through OTP. Directory matching prevents arbitrary unknown values but cannot prove who submitted them. Add email OTP or SMS OTP to verify ownership.
- Existing request history, repeat counters, and replacement approval logic unchanged.
