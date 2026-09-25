# family-butler-v2

Monorepo scaffold for a React frontend + Azure Functions backend using Supabase (PostgreSQL) as the database.

## Stack

- Frontend: React + Vite + TypeScript (`/frontend`)
- Backend: Azure Functions (Node.js) (`/api`)
- Database: Supabase PostgreSQL (server-side access from API)
- Deployment target: Azure Static Web Apps with API backend

## Repository Structure

```text
.
├── api
│   ├── shared/db
│   └── {function}/(function.json,index.js)
├── frontend
│   └── src
│       ├── features
│       ├── pages
│       └── shared
├── docs
├── CONTRIBUTING.md
└── .github/workflows
```

## Current Architecture Notes

- API persistence remains provider-based under `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/db` (Supabase provider currently active).
- Frontend shared UI primitives are under `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/shared/ui`.
- Shared member avatar color logic now lives in `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/shared/family/memberAvatarColors.ts` and is reused across app bootstrap/settings/dialog code.
- Frontend feature UI is feature-first under `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/features/<feature>/components` (for example auth screen under `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/features/auth/components`).

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase project
- Azure Functions Core Tools (for local API runtime)

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:

   ```bash
   cp /home/runner/work/family-butler-v2/family-butler-v2/api/.env.example /home/runner/work/family-butler-v2/family-butler-v2/api/.env
   cp /home/runner/work/family-butler-v2/family-butler-v2/frontend/.env.example /home/runner/work/family-butler-v2/family-butler-v2/frontend/.env
   ```

3. Fill API env values in `/home/runner/work/family-butler-v2/family-butler-v2/api/.env`:

   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`

4. Fill frontend auth env values in `/home/runner/work/family-butler-v2/family-butler-v2/frontend/.env`:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

5. Start frontend + backend:

   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Run frontend and backend in parallel
- `npm run build` - Build backend and frontend
- `npm run storybook --workspace frontend` - Run Storybook locally
- `npm run build-storybook --workspace frontend` - Build Storybook static output

## Contributing

Please use `/home/runner/work/family-butler-v2/family-butler-v2/CONTRIBUTING.md` for branch, validation, and documentation expectations.

## API Runtime (Azure Functions)

- `/home/runner/work/family-butler-v2/family-butler-v2/api/health` → `GET /api/health`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/tasks` → `GET /api/tasks`, `POST /api/tasks`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/households` → `GET /api/households`, `POST /api/households`, `GET /api/households/{householdId}`, `PUT /api/households/{householdId}`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/auth-config` → `GET /api/auth-config`

Health diagnostics:

- `GET /api/health` returns a lightweight liveness response.
- `GET /api/health?checks=1` validates Supabase env setup and database connectivity.

## Supabase migration guide

Use `/home/runner/work/family-butler-v2/family-butler-v2/docs/SUPABASE.md` for the full cutover guide, including schema creation and seed SQL.

## Agentic feature architecture docs

For the planned agent chat + MCP functionality, see:

- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_OVERVIEW.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_CHAT_ARCHITECTURE.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_MCP_ARCHITECTURE.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_INFRASTRUCTURE.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_EVE_EVALUATION.md`

## Azure Deployment Notes

This repository includes an Azure Static Web Apps workflow under:

- `/home/runner/work/family-butler-v2/family-butler-v2/.github/workflows/azure-static-web-apps-polite-hill-0ea169003.yml`

Set these app settings in Azure Static Web Apps:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Frontend build-time env values (optional if runtime auth config is provided by API):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

No Infrastructure-as-Code is included by design.
