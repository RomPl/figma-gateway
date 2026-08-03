# Rollback index

Project: **Figma Gateway**

- Primary rollback reference: [`docs/README.md`](../docs/README.md)
- Before deployment, record the previous branch/commit, service state, health result, and backup/quarantine location.
- Roll back by restoring the previous reviewed commit or deployment artifact, then rerun config/tests and health checks.
- Never restore secret-bearing files from quarantine into a worktree without a separate security review.
