# Agentic Feature Overview

This folder documents the planned **agentic** feature as a separate capability in Family Butler.

## Scope

1. **Agent chat** in the frontend:
   - Text input
   - Drag-and-drop PDF upload
   - Drag-and-drop image upload
2. **Agent backend** powered by ChatGPT API first, with provider abstraction for future LLM providers.
3. **MCP server surface** to expose Family Butler skills/actions so any compatible agent can read and write Family Butler data through controlled APIs.

## Design goals

- Keep compatibility with the current Azure Static Web Apps + Azure Functions architecture.
- Keep secrets server-side only.
- Reuse existing API + DB provider patterns.
- Keep all agent actions auditable and permission-checked per household/user.

## Documents

- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_CHAT_ARCHITECTURE.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_MCP_ARCHITECTURE.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_INFRASTRUCTURE.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_EVE_EVALUATION.md`
- `/home/runner/work/family-butler-v2/family-butler-v2/docs/agentic/AGENTIC_TOOLS_GUIDE.md`
