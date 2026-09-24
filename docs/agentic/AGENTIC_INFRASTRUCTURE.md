# Agentic Infrastructure Setup (Documentation)

This document defines infrastructure and runtime configuration for the upcoming agentic feature while preserving current repository constraints.

## Runtime topology

- Frontend (React/Vite) calls only `/api/*`.
- Azure Functions host:
  - Agent chat endpoints
  - MCP endpoints
  - Existing Family Butler API endpoints
- Supabase remains the system of record.
- LLM provider APIs are called from server-side functions only.

## Environment variables (API runtime)

Add these in Azure Static Web Apps **Application settings** (not in source control):

- `LLM_PROVIDER=openai`
- `OPENAI_API_KEY=<secret>`
- `OPENAI_MODEL_CHAT=<model name, e.g. gpt-4.1>`
- `OPENAI_MODEL_VISION=<model name>`
- `AGENT_MAX_FILE_BYTES=<numeric limit>`
- `AGENT_MAX_FILES_PER_MESSAGE=<numeric limit>`

Keep existing Supabase variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

## Storage and file handling

Recommended options for attachment payloads:

1. Supabase Storage bucket (preferred for alignment with existing stack), or
2. Azure Blob Storage (if operationally preferred later).

Minimum controls:

- random/object-id file naming
- MIME + extension validation
- max-size enforcement before provider call
- metadata persistence in DB for auditability

## Operational safeguards

- Per-user rate limiting for chat and MCP tool calls.
- Request/response correlation IDs in logs.
- Centralized error mapping to safe client messages.
- Timeouts and retries for provider API calls.

## CI/CD compatibility notes

- Keep all new APIs as Azure Function handlers (`function.json` + `index.js`).
- Do not introduce long-running Node HTTP server processes.
- Keep secrets out of repository and out of frontend runtime bundles.

## Rollout plan (phased)

1. Phase 1: Agent chat (text only) with OpenAI provider.
2. Phase 2: Attachments (PDF/image) with validation and storage.
3. Phase 3: MCP read-only tools.
4. Phase 4: MCP write tools with audit logs and stricter quotas.
