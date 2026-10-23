# v64 changes
- Reused fixed grid-based statistics layout and request-style spacing.
- Matched dashboard filter heights to 40px.
- Enabled internal grid scrolling for increased page sizes, while retaining pagination.
- Fixed Request viewport containment and scroll.
- Added public support form at `/support-request` (no login), validated against uniquely assigned active DID and Employee_Directory, with per-IP/agent rate limiting and honeypot.
- Public requests join the existing Pending_Requests queue; repeats increment call_count, and each public submission is appended to Public_Request_Events with IST timestamp and summary.
- No automatic DID replacement.
- Google Sheets writes are not transactional across worksheets; if event append fails after queue update, operator should reconcile the logs.
