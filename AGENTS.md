# Agent operating rules

- Treat `/mnt/newdisk/home/figma-gateway.vazovski.art` as the project-local source tree for **Figma Gateway**.
- Inspect `git status`, current branch, and relevant documentation before changing files.
- Never reset or delete unknown changes. Preserve intentional work in an isolated branch and capture a status/diff snapshot before cleanup.
- Never commit `.env`, credentials, tokens, cookies, private keys, database dumps, or long production logs.
- Backup and generated artifacts belong outside the worktree or under explicit ignore rules.
- Validate with `npm run check && npm test && npm run build` before publication.
- Runtime changes require health verification via `https://figma-gateway.vazovski.art/health` and a documented rollback path.
- Publish through a reviewed PR when an origin remote exists; otherwise retain immutable local commit evidence and document the missing remote.
