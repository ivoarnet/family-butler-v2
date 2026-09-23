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
├── frontend
├── docs
└── .github/workflows
```

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
   - `SUPABASE_SECRET_KEY`
   - `DEMO_HOUSEHOLD_ID` (optional, defaults to `00000000-0000-0000-0000-000000000001`)

4. Fill frontend env values in `/home/runner/work/family-butler-v2/family-butler-v2/frontend/.env`:

   - `VITE_API_BASE_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_HOUSEHOLD_ID` (admin default household for local development)
   - `VITE_DEMO_HOUSEHOLD_ID` (demo household read-only scope)

5. Start frontend + backend:

   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Run frontend and backend in parallel
- `npm run build` - Build backend and frontend

## API Runtime (Azure Functions)

- `/home/runner/work/family-butler-v2/family-butler-v2/api/health` → `GET /api/health`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/tasks` → `GET /api/tasks`, `POST /api/tasks`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/households` → `GET /api/households/{householdId}`, `PUT /api/households/{householdId}`, `DELETE /api/households/{householdId}`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/user-settings` → `GET /api/user-settings`, `PUT /api/user-settings`, `POST /api/user-settings`

All non-health API calls require a Supabase access token in the `Authorization` header.

Health diagnostics:

- `GET /api/health` returns a lightweight liveness response.
- `GET /api/health?checks=1` validates Supabase env setup and database connectivity.

## Supabase migration guide

Use `/home/runner/work/family-butler-v2/family-butler-v2/docs/SUPABASE.md` for the full cutover guide, including schema creation and seed SQL.

## Azure Deployment Notes

This repository includes an Azure Static Web Apps workflow under:

- `/home/runner/work/family-butler-v2/family-butler-v2/.github/workflows/azure-static-web-apps-polite-hill-0ea169003.yml`

Set these app settings in Azure Static Web Apps:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

For frontend auth to work in production, also add these as **GitHub repository secrets** (used at build time by Vite in the deployment workflow):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_HOUSEHOLD_ID` (optional)
- `VITE_DEMO_HOUSEHOLD_ID` (optional)

Optional (frontend-only use cases):

- `SUPABASE_PUBLISHABLE_KEY`

No Infrastructure-as-Code is included by design.
