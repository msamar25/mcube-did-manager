# v20 Request confirmation modals
- Approve/Reject in Request tab now opens a confirmation modal with request details and editable reason. No status update before confirmation.
- Replace selected (FIFO) in Request tab now opens a confirmation modal with selected request details and proposed FIFO pool DIDs. No replacement starts before confirmation.
- Dashboard individual and bulk reassignment confirmation modals remain unchanged.
- The proposed FIFO preview is not a reservation; backend performs authoritative live validation.
- Backend call-to-agent matching remains unchanged.
- Frontend build was not performed (node_modules unavailable). Test before production.
