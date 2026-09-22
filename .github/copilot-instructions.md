# Agentic Development Instructions

## Scope and goals

- Keep changes small, targeted, and aligned to the current architecture.
- Prioritize production-safe defaults, security, and predictable CI behavior.
- Do not introduce Infrastructure-as-Code for Azure resources in this repository.

## Current architecture

- Frontend: React + Vite in `/home/runner/work/family-butler-v2/family-butler-v2/frontend`
- API: Azure Functions (Node.js) in `/home/runner/work/family-butler-v2/family-butler-v2/api`
- Data: Prisma + PostgreSQL schema in `/home/runner/work/family-butler-v2/family-butler-v2/prisma/schema.prisma`
- Deployment workflow: `/home/runner/work/family-butler-v2/family-butler-v2/.github/workflows/azure-static-web-apps.yml`

## Development rules

1. Preserve Azure Static Web Apps compatibility:
   - Keep API endpoints implemented as Azure Functions handlers (`function.json` + `index.js`).
   - Avoid introducing long-running HTTP server patterns (`app.listen`) in API runtime code.
2. Keep Prisma as the only ORM:
   - Reuse `/prisma/schema.prisma`.
   - Run `npm run prisma:generate` after schema changes.
3. Maintain workspace conventions:
   - Use root scripts from `/home/runner/work/family-butler-v2/family-butler-v2/package.json`.
4. Keep dependencies minimal and secure:
   - Prefer existing dependencies.
   - Update vulnerable packages to patched versions.
5. Do not commit secrets:
   - Use `.env.example` for templates only.
   - Keep real credentials in GitHub/Azure secret stores.

## Validation checklist for agents

- Install/update deps: `npm install`
- Build verification: `npm run build`
- For API/data changes: verify Prisma commands still work
  - `npm run prisma:generate`
  - `npm run prisma:migrate` (local/dev only)
- Run secret scan before committing changed files.

## Change hygiene

- Do not commit build artifacts, temporary files, or local settings.
- Keep docs updated when architecture, commands, or setup steps change.
- After UI changes, create and include at least one updated screenshot in the PR comment.
- Document UI screenshot-related updates in the changelog.
- If CI/build issues are reported, inspect workflow runs and logs before changing code.
