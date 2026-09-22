# Azure SQL Setup

## 1) Connect Azure SQL to the Static Web App/API

Family Butler connects to Azure SQL only through the server-side Azure Functions API (`/api`).

1. Set `DATABASE_URL` in Azure Static Web Apps application settings (or linked Function App settings if split hosting).
2. Use the SQL Server Prisma connection format:

   ```text
   sqlserver://<server>.database.windows.net:1433;database=<db>;user=<user>;******;encrypt=true;trustServerCertificate=false;
   ```

3. Keep credentials server-side only. Do not expose DB credentials in frontend env vars.

## 2) Azure SQL firewall/network requirements

- Allow Azure services or configure private networking so the Functions runtime can reach the SQL server.
- Add local development IP(s) temporarily when running Prisma or API locally.
- Keep `Encrypt=True` and `TrustServerCertificate=False`.

## 3) Local environment setup (no committed credentials)

1. Copy templates:

   ```bash
   cp /home/runner/work/family-butler-v2/family-butler-v2/api/.env.example /home/runner/work/family-butler-v2/family-butler-v2/api/.env
   cp /home/runner/work/family-butler-v2/family-butler-v2/prisma/.env.example /home/runner/work/family-butler-v2/family-butler-v2/prisma/.env
   cp /home/runner/work/family-butler-v2/family-butler-v2/frontend/.env.example /home/runner/work/family-butler-v2/family-butler-v2/frontend/.env
   ```

2. Fill real values in local `.env` files only.
3. Never commit real credentials.

## 4) Apply schema changes safely

1. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

2. Apply/update schema in development:

   ```bash
   npm run prisma:migrate
   ```

3. Initialize/update schema in Azure SQL (production/staging):

   ```bash
   npm run prisma:migrate:deploy
   ```

4. Verify API starts and can read/write household data through `/api/households/{householdId}`.

## 5) Deploy and verify

1. Ensure `DATABASE_URL` is configured in Azure app settings.
2. Ensure the Azure SQL schema is applied before app verification:

   ```bash
   npm run prisma:migrate:deploy
   ```

3. Deploy via the existing GitHub workflow.
4. Open the app, edit household/member/contact data in Settings, refresh the browser, and confirm values persist.
5. Re-open after redeployment and confirm the same persisted values are returned.
