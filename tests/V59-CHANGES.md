# v59 corrections
- Employee_Directory email lookup now reads raw sheet rows; matches only normalized agent_no to agent_number and returns safe failure diagnostics. Requires valid Google Sheets access and live validation.
- Five DID and request rows per page by default; pagination remains configurable.
- Column picker also controls DID filters. New request column/filter picker.
- Request bulk replace moved into search toolbar. Request confirmation uses a single current DID / proposed new DID review table, not step tabs.
- Desktop 18/82 responsive layout, compact stat icons, modal spacing adjustments.
- Live Google Sheets connection, actual UI viewport and replacement execution require staging tests.
