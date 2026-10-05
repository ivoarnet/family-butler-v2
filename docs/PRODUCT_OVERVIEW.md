# Family Butler Product Overview

Family Butler helps households coordinate the people and plans involved in family life. The product is organized around household-focused modules, with agents as the primary way to access and manage functionality.

## Product principles

- **Agent-first access:** functionality across modules is intended to be available through one or more agents. Agents should understand the relevant household context and perform actions through permission-checked product capabilities.
- **Clear module boundaries:** modules describe related user needs and workflows; common household concepts such as members, contacts, and calendar data can be shared across modules.
- **Honest implementation status:** distinguish shipped functionality from planned work. A module description is not a promise that all of its capabilities are implemented or agent-accessible today.

## Core household and calendar capabilities — implemented

The current product supports:

- Creating and managing households, and organizing household members.
- Maintaining household contacts, including birthday details.
- Defining event types and creating household calendar events associated with members. Events support all-day or timed scheduling, recurrence, location, and notes.
- Displaying events in a shared calendar and marking configured special days.
- Using the agent chat for supported tasks involving contacts, birthdays, events, and day configurations. The agent currently supports text and PDF/image attachments; its available actions do not yet cover every web-app capability.

See [Data Model](DATA_MODEL.md) for current domain and persistence details, and [Agent Chat Tools Guide](agentic/AGENTIC_TOOLS_GUIDE.md) for the actions currently exposed to the agent.

## Planned modules

### Daycare — next

Childcare Planning helps households organise and view recurring care arrangements provided by grandparents, individual carers, daycare centres, and school programmes. It supports all-day and timed care, participating children, and one-off changes such as cancellations, replacements, and moved dates.

### Parenting Time — later

Parenting Time helps separated or divorced parents plan and view when their children are scheduled to be with each parent. It supports repeating weekly or alternating-week arrangements, handover times, and one-off changes for holidays, swaps, or special agreements.

## Managing module documentation

This document is the product-level index and source of truth for module names, summaries, and roadmap status. When a module grows beyond a short overview, add a focused document under `docs/modules/` and link it here.

For each module, document:

- Its user need, scope, and status (implemented, in progress, or planned).
- Core concepts and the module's boundaries with shared household capabilities and other modules.
- Agent workflows and the product capabilities/tools that support them; clearly label planned agent coverage.
- Relevant implementation, data-model, and API documentation.

Keep descriptions of current behavior grounded in the implementation. Update this overview and any affected module documentation when scope, status, or agent support changes.
