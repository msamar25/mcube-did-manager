// Admissions journey zones (Student Enquiries, Counsellor Guidance, Application Processing,
// Payment & Enrollment) are not active yet and there is no backend data for them.
// Set to true to show them again in the 3D hub, the 2D map and the detail panels.
export const ADMISSIONS_ENABLED = false;

// Support-ticket lifecycle mapping for the 3D Support Hub.
// Uses ONLY the existing Pending_Requests statuses — no new backend status is introduced:
//   Incoming Tickets = pending + approved + review_required (open, not yet being worked)
//   In Progress      = processing + needs_reconciliation (batch stopped; must be checked in MCube)
//   Resolved         = completed
//   Failed           = failed
//   rejected (turned down at review) is a closed outcome: counted separately, not as resolved or failed
// Admissions-stage counts (enquiries / guidance / application / payment) are NOT tracked by the
// backend today, so they are clearly flagged as preview figures.
export const TICKET_ZONES = {
  incoming: { label: 'Incoming Tickets', statuses: ['pending', 'approved', 'review_required'], color: '#f5a524' },
  progress: { label: 'In Progress', statuses: ['processing', 'needs_reconciliation'], color: '#3b82f6' },
  resolved: { label: 'Resolved', statuses: ['completed'], color: '#22c55e' },
  failed: { label: 'Failed', statuses: ['failed'], color: '#ef4444' }
};
export const ADMISSIONS_ZONES = {
  enquiries: { label: 'Student Enquiries', preview: 124 },
  guidance: { label: 'Counsellor Guidance', preview: 86 },
  application: { label: 'Application Processing', preview: 62 },
  payment: { label: 'Payment & Enrollment', preview: 41 }
};
export function supportData(requests = []) {
  const counts = {};
  for (const [k, z] of Object.entries(TICKET_ZONES)) counts[k] = requests.filter((r) => z.statuses.includes(r.status)).length;
  const admissions = ADMISSIONS_ENABLED ? Object.fromEntries(Object.entries(ADMISSIONS_ZONES).map(([k, z]) => [k, z.preview])) : {};
  const rejected = requests.filter((r) => r.status === 'rejected').length;
  const reconcile = requests.filter((r) => r.status === 'needs_reconciliation').length;
  return { counts, admissions, rejected, reconcile, open: counts.incoming + counts.progress };
}
// route filter for the Support Requests page
export const STATUS_FILTER = { incoming: 'incoming', progress: 'processing', resolved: 'completed', failed: 'failed' };
