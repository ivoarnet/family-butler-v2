# family-butler-v2

Monorepo scaffold for a React frontend + API backend with Prisma and Azure SQL Database.

## Stack

- Frontend: React + Vite + TypeScript (`/frontend`)
- Backend: Azure Functions (Node.js) (`/api`)
- Database: Azure SQL Database (SQL Server) via Prisma (`/prisma/schema.prisma`)
- Deployment target: Azure Static Web Apps with API backend (Azure resources created manually)

## Repository Structure

```text
.
├── api
├── frontend
├── prisma
└── .github/workflows
```

## Prerequisites

- Node.js 20+
- npm 10+
- Azure SQL Database
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
   cp /home/runner/work/family-butler-v2/family-butler-v2/prisma/.env.example /home/runner/work/family-butler-v2/family-butler-v2/prisma/.env
   ```

3. Update `DATABASE_URL` in:
   - `/home/runner/work/family-butler-v2/family-butler-v2/api/.env`
   - `/home/runner/work/family-butler-v2/family-butler-v2/prisma/.env`

4. Generate Prisma client and apply schema changes:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

   For Azure-hosted environments, apply committed migrations with:

   ```bash
   npm run prisma:migrate:deploy
   ```

5. Start frontend + backend:

   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Run frontend and backend in parallel
- `npm run build` - Build backend and frontend
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run Prisma migrations (dev)
- `npm run prisma:migrate:deploy` - Apply committed Prisma migrations (staging/production)


## Frontend Build Output

For Azure Static Web Apps deployment, the frontend build output folder is:

- `frontend/dist` (configured in workflow as `app_location: frontend` + `output_location: dist`)

## API Runtime (Azure Functions)

The API is implemented as Azure Functions handlers for Static Web Apps compatibility:

- `/home/runner/work/family-butler-v2/family-butler-v2/api/health` → `GET /api/health`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/tasks` → `GET /api/tasks`, `POST /api/tasks`
- `/home/runner/work/family-butler-v2/family-butler-v2/api/households` → `GET /api/households/{householdId}`, `PUT /api/households/{householdId}`

## Azure Deployment Notes (Manual Resource Creation)

This repository includes an Azure Static Web Apps workflow under:

- `/home/runner/work/family-butler-v2/family-butler-v2/.github/workflows/azure-static-web-apps-polite-hill-0ea169003.yml`
- `/home/runner/work/family-butler-v2/family-butler-v2/.github/workflows/deploy-prisma-schema.yml` (manual Prisma schema deployment)

You should manually create Azure resources, then configure GitHub secrets:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`
- `DATABASE_URL` (recommended as an Environment secret for migration workflow)

No Infrastructure-as-Code is included by design.
