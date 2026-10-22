# V33 QC and operations intelligence

- Read-only request turnaround based on first_call_utc to completed_utc, not MCube lastcall.
- Separate repeated requests per employee from repeated calls in one request.
- Employee median interval between distinct requests, manager/TL repeat employee counts, average resolution hours, completion rate.
- All durations exclude invalid or missing timestamps.
- Existing approval and reassignment workflow unchanged. No automatic DID replacement.
- Current manager/TL mappings are not historical snapshots.
- A request first recorded after a replacement cannot reliably measure next-request latency without matching to the correct preceding replacement; do not interpret days_since_last_replacement as the next-request gap.
- Validate live Google Sheets timestamp formats and frontend build before production.
