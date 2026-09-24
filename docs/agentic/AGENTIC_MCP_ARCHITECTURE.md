# MCP Server Architecture for Family Butler

## Goal

Expose Family Butler data and actions as MCP skills/tools so external agents can safely:

- Read household data
- Create/update Family Butler data
- Execute bounded workflows with user-level authorization

## Deployment pattern

Implement MCP endpoints behind Azure Functions (same API runtime), for example:

- `GET /api/mcp/capabilities`
- `POST /api/mcp/tools/list`
- `POST /api/mcp/tools/call`

## Tooling strategy

Group MCP tools by domain:

- Household
  - `household.list`
  - `household.get`
- Members
  - `members.list`
  - `members.create`
  - `members.update`
- Contacts
  - `contacts.list`
  - `contacts.create`
  - `contacts.update`
- Events
  - `events.list`
  - `events.create`
  - `events.update`

Each tool should enforce:

- Authenticated user
- Household access check
- Input schema validation
- Audit log write

## Adapter layering

- `mcp/transport` — protocol translation and request/response envelopes
- `mcp/tools` — individual tool handlers
- `domain/services` — business logic (reuse existing API logic where possible)
- `shared/db/providers` — Supabase provider calls

## Security boundaries

- No direct DB access from MCP transport layer.
- Execute only explicit allowlisted tools.
- Validate every tool input with schemas.
- Apply per-user and per-household permission checks.
- Rate limit tool execution per user/token.

## Auditing

Store an audit record for each tool execution:

- user id
- household id
- tool name
- request id / correlation id
- status (success/failure)
- timestamp

## Versioning

- Start with `v1` MCP tool naming and schema contracts.
- Keep backwards compatibility for existing tool names.
- Additive changes preferred; breaking changes require `v2` namespace.
