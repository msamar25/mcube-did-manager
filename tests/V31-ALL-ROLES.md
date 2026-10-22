# v31 — All configured MCube employee roles

Employee sync now includes role 1 (administrator) in addition to roles 2–5. The role list is configurable with optional `MCUBE_EMPLOYEE_ROLES` (comma-separated, default `1,2,3,4,5`) if MCube introduces more role IDs. This does not restrict request matching to a specific role. All role responses must succeed before replacing Employee_Directory, protecting existing records on partial failures. Employee matching still uses `emp_phone`/`agent_number` irrespective of role.

Note: MCube has not supplied a documented unfiltered all-roles API; configured role IDs must cover every role used by the tenant. No new environment variable is required for roles 1–5.
