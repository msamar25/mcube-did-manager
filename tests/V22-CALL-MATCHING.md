# v22: MCube request import

- Endpoint: POST https://config.mcube.com/Restmcube-api/filter-inbound (override MCUBE_CONFIG_BASE_URL).
- Body uses arr.clicktocalldid, duration_type=total_duration, type=today, filters=null, tabtype/filter/month empty, offset/limit and a newly acquired config-login Authorization JWT.
- MCube often omits clicktocalldid in each returned call row because it is already used as a server-side filter. v21 incorrectly discarded those calls; v22 accepts omitted field but rejects an explicitly different DID.
- Calls must be inbound/cancel and callto must match exactly one employee from the synced roles 2,3,4,5 directory AND exactly one active DID agent_no. This extra condition prevents an unsafe reassignment without a known current DID.
- Distinct callids increment an existing open request, including repeated calls; completed/rejected requests remain history and later calls create new requests.
- Recent replacement warning is controlled by Settings > Recent replacement warning (days), e.g. 3-7, and administrator review toggle.
- No live MCube test was performed. Rotate JWTs pasted into chat.
