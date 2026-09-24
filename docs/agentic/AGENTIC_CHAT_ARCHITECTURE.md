# Agent Chat Architecture

## User capability

The chat experience should support:

- Text prompts
- PDF upload (drag/drop or file picker)
- Image upload (drag/drop or file picker)

## High-level flow

1. User sends text and optional files from frontend chat UI.
2. Frontend calls Azure Function endpoint: `POST /api/agent/chat`.
3. API authenticates user and resolves active household context.
4. API validates file size/type and stores uploaded content metadata.
5. API routes request to an LLM provider adapter (`openai` first).
6. API returns agent response + structured references (files, actions, tool events).

## Suggested API surface (Azure Functions)

- `POST /api/agent/chat` — sends user message + optional attachments
- `GET /api/agent/conversations/{conversationId}` — loads message history
- `POST /api/agent/conversations/{conversationId}/messages` — append message

All endpoints remain function-based handlers (`function.json` + `index.js`) to preserve Azure Static Web Apps compatibility.

## Suggested backend modules

- `/api/shared/agent/providers/`
  - `openaiProvider.js` (first provider)
  - future: `anthropicProvider.js`, `azureOpenAIProvider.js`, etc.
- `/api/shared/agent/attachments/`
  - MIME/type validation
  - size checks
  - metadata normalization
- `/api/shared/agent/prompts/`
  - system prompt templates
  - safety prompt guards

## Data model extension (recommended)

Add new tables (or equivalent provider-managed persistence):

- `agent_conversations`
  - `id`, `household_id`, `created_by_user_id`, timestamps
- `agent_messages`
  - `id`, `conversation_id`, `role`, `content`, `provider`, `model`, timestamps
- `agent_attachments`
  - `id`, `message_id`, `kind` (`pdf`/`image`), `mime_type`, `storage_ref`, `size_bytes`

## Security and validation requirements

- Validate MIME and extension allowlist:
  - PDF: `application/pdf`
  - Images: `image/png`, `image/jpeg`, `image/webp`, `image/heic` (optional)
- Enforce max file size and max file count per message.
- Reject unsupported file types.
- Keep all API keys server-side (never in frontend build).
- Log provider errors without exposing sensitive payloads to clients.

## Provider abstraction

Use a provider interface so adding new model providers does not change endpoints:

- `sendMessage({ messages, attachments, context })`
- `supportsVision()`
- `supportsPdf()`
- `estimateCost()` (optional for metering)
