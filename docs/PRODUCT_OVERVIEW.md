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

## Childcare — Settings, calendar, and agent read coverage implemented

Childcare Planning helps households organise recurring care arrangements provided by grandparents, individual carers, daycare centres, and school programmes. Its authenticated household API persists providers, weekly all-day or timed arrangements with one or more children, and one-off added days, cancellations, replacements, and moved dates. A server-side resolver returns effective occurrences for a selected date range without creating calendar events. The household calendar displays resolved care with the provider, participating children, timing, and one-off adjustments. Agent chat can read explainable resolved coverage for a requested date range through a household-scoped server-side tool.

Settings → Childcare supports creating, editing, deactivating, and reactivating providers; creating and editing weekly arrangements with participating children; reviewing resolved draft occurrences before saving; adding a care date to a selected arrangement; and cancelling, replacing, or moving a single upcoming occurrence. Recurring care and one-off changes are labelled separately. The calendar shows all-day and timed resolved care in its visible two-week range. The `get_childcare_coverage` agent tool reads persisted resolved coverage; it does not make care changes.

Settings → Childcare also provides a provider-centred resolved list and monthly calendar. The default is List with a three-calendar-month range starting today (ending the day before the date three months later, with month-end clamping). Use a provider's **View schedule** action or the **Schedule provider** selector (including inactive providers), choose an inclusive date range, and select **Show care**. Both views show effective providers/dates, all participating children, all-day or timed care, and recurring versus one-off adjustments. Cancelled care is excluded from appointments and listed separately. These views reload persisted care through the existing resolver API; no new agent actions are added.

Payments, booking, capacity, and attendance are outside this implementation. See [Childcare model and API](DATA_MODEL.md#childcare--implemented) and [Supabase setup](SUPABASE.md#childcare-migration).

## Parenting Time — household API and resolver implemented

Parenting Time helps separated or divorced parents plan when all children in a household are scheduled to be with each parenting party. The authenticated household API persists parties, one weekly or alternating ISO-week plan with timed handovers, and one-off changes. A server-side resolver derives explainable effective intervals from persisted data. No management UI, calendar display, or agent workflow is currently shipped. See [Parenting time model and API](DATA_MODEL.md#parenting-time--persisted-plan-and-server-resolver).

## Planned modules

## Managing module documentation

This document is the product-level index and source of truth for module names, summaries, and roadmap status. When a module grows beyond a short overview, add a focused document under `docs/modules/` and link it here.

For each module, document:

- Its user need, scope, and status (implemented, in progress, or planned).
- Core concepts and the module's boundaries with shared household capabilities and other modules.
- Agent workflows and the product capabilities/tools that support them; clearly label planned agent coverage.
- Relevant implementation, data-model, and API documentation.

Keep descriptions of current behavior grounded in the implementation. Update this overview and any affected module documentation when scope, status, or agent support changes.
