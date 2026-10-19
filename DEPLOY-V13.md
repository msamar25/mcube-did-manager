# v13 category-specific inventory display
- Active: show select, serial, DID, agent name, agent number, operator, status and reassign action.
- Inactive and Pool: show serial, DID, operator and status only.
- Preserve duplicate rows from MCube on read-only import; highlight repeated DID numbers within a category. Do not use duplicate DID records for reassignment.
- Active MCube entries with agent_name `common pool` and empty agent_no display as Common pool, not Counsellors.
- No database, API endpoints, or credential changes.
- Copy contents of this folder to repository root; commit and push to deploy.
