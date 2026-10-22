# v14 UI and reassignment confirmation changes

- Dashboard active rows: per-page selection checkbox, select-all eligible, clear selection, dedicated bulk confirmation, and individual confirmation without adding the DID to the bulk selection.
- Preview uses current cached FIFO order; server revalidates live inventory and FIFO before changes, so actual assignment can differ if inventory changes.
- Existing backend sequential processing and Google Sheets journal are preserved. Explicit deactivation rejection is logged as failed and processing continues; uncertain or partial outcomes stop the batch for reconciliation.
- Operation results are shown as Completed, Failed / pending review, or Stopped / reconcile.
- Status colors: Counsellors blue, inactive red, pool green, common pool amber.
- The replacement date is a UI preview field only; existing backend does not persist it. Do not rely on it as an audit timestamp. Actual server event timestamps are authoritative.
- This release has NOT been verified by a live MCube call. Test with a single authorized DID before enabling bulk changes.

## Deploy
Copy the contents of this directory to your existing GitHub repository root; commit and push. Render redeploys from the repository. Keep existing Render environment variables. Verify that your deployment includes the latest commit.
