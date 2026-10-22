# v30 Employee Directory Reconciliation

The user-supplied role-2 MCube response has 675 employees: 674 valid employee phones and one employee with a blank phone. The pasted Google Sheets directory has 718 unique phones and already contains all 674 valid phones from that API response. Its remaining 44 entries are not in the supplied role-2 response and may be other roles; this cannot be verified without those role responses.

Employee sync continues to fetch roles 2,3,4,5 and only replaces the directory after all four calls succeed. It now reports previous_count, added, removed, details_changed, and sheet_updated, and verifies phone counts after a write. No sheet write occurs when the directory already matches (apart from the sync timestamp).

Deploy to the existing Render service and click Sync Employees. If `removed` is nonzero, check which roles MCube returned before using the directory for automated DID operations. This release does not directly edit live Google Sheets.
