# Modular architecture and developer guide

## Status and scope

This is the concept for growing Family Butler as a **modular monolith**: one React application, one Azure Functions API, and provider-based persistence. No plugin loader, separate servers, event broker, Azure infrastructure, or new module database tables are introduced by this change. The navigation registry and left drawer are implemented; the future contracts below are design guidance, not shipped APIs.

The [product overview](../PRODUCT_OVERVIEW.md) remains the canonical module/status index.

| Module / capability | Ownership and status |
| --- | --- |
| Family Calendar | Existing default `/` workspace; owns household events and calendar presentation. |
| Childcare | Shipped Family Calendar sub-feature; owns providers, arrangements, overrides, and resolved coverage. Settings → Childcare and calendar display remain unchanged. |
| Shared Parenting | Shipped Family Calendar sub-feature, named **Parenting Time** in existing Settings/API; owns parties, schedules, changes, and resolved responsibility. This concept does not rename existing UI or APIs. |
| Reports & exports | Existing `/reports` workspace; actual reports/downloads are still planned. Listed separately from modules' domain workflows. |
| Tasks | Planned independent module: member-assigned Kanban tasks with due dates; provides due-task summaries to Calendar. |
| Shop & Cook | Planned independent module: shopping lists/items, with a future Bring! adapter. No synchronization is implemented. |
| Gamification | Planned independent module: can react to other modules' committed domain events. Family Coins and award rules are deliberately unspecified. |

Households, members, contacts, authentication, theme, navigation, and reusable UI are shared foundations, not competing calendar modules. A sub-feature belongs to a module's workflow but may have its own API/resolver and Settings entry. Future peer modules need not be children of Calendar.

## Boundaries and interaction

Each module owns its data, validation, writes, and domain rules. Other modules must use its public application capabilities rather than accessing its tables, internal state, or provider implementation. Use household/member IDs from the shared foundation; do not copy member records into module-owned data. A calendar view is a composition of data, not the owner of everything displayed on it.

### Reads and projections

The existing calendar already composes events with resolved Childcare and Parenting Time data, without converting arrangements or responsibility intervals into household events. Extend that pattern:

1. Tasks would expose an authorized, household-scoped read capability such as `getDueTasks({ householdId, from, to, memberIds })`.
2. Its planned result would include a stable task ID, title, due date, assigned member IDs, status, and a module destination. Task ownership remains with Tasks.
3. Calendar would adapt those results into due-task indicators, grouped by date/member, linking back to Tasks. Task edits happen through Tasks capabilities, not a duplicate calendar-event write.
4. Requests must be bounded to the visible range and cancelled/ignored when the household or range changes. Specify inclusive date-only ranges versus timestamp intervals and timezone handling explicitly.
5. Loading/failure of an optional projection must not block normal calendar events. Show an appropriate local unavailable state; never treat a failed read as a confirmed empty result.

Keep frontend adapters near the consuming feature and server read contracts near the owning module. Begin with explicit API calls and small typed contracts; avoid a generic extension framework before multiple real consumers need it.

### Committed events (future)

For reactions rather than reads, define versioned server-side domain events, for example:

```json
{
  "id": "unique-event-id",
  "type": "tasks.task-completed",
  "version": 1,
  "householdId": "household-id",
  "occurredAt": "2026-10-10T12:00:00Z",
  "actorId": "authorized-user-id",
  "payload": { "taskId": "task-id", "memberIds": ["member-id"] }
}
```

This envelope is proposed, not implemented. Emit only after a successful, authorized state transition, not a UI click, preview, failed save, or repeated write of the same state. Keep payloads minimal (IDs, not private notes or credentials). Consumers must reject unsupported versions and enforce household boundaries.

Gamification can subscribe to task-completed events or later Shop & Cook/Calendar events without those producers importing coin/award logic. Gamification owns its eventual ledger and policies. No reward amount, reversal rule, balance calculation, or mechanics are specified here.

When a durable reaction is implemented, persist an outbox record atomically with the domain write through the provider layer; process it with a supported Azure Functions background/queue pattern selected in that release. Assume at-least-once delivery, retries/backoff and failed-message visibility. Consumers deduplicate by event ID plus consumer ID and commit their effect and processed marker together. Do not use a browser event bus or fire-and-forget HTTP call for durable rewards. Reprocessing or unavailable Gamification must not prevent completing a task. Document ordering needs and correction events before shipping consumers. No broker or worker is added now.

### External integrations (future)

Shop & Cook owns the Bring! integration behind a server-side adapter, separate from its list domain. Keep OAuth tokens/credentials server-side in approved secret stores, never frontend settings or event payloads. Before implementation, verify the provider's supported API, authentication, and usage terms; availability is not assumed.

Define per-household external list/item mappings, least-privilege consent and disconnect/revocation, conflict/deletion policies, retry and rate-limit handling, idempotent writes, and sync-origin markers to avoid echo loops. Authenticate any webhook and verify signatures/replay protection if supported. Provider outages must leave local lists usable and expose synchronization status. Agents call the same permission-checked product capability, not external providers directly.

## Navigation and open-question assumptions

- `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/features/app/modules.ts` is the implemented ordered destination registry. It lists Family Calendar, its two nested sub-features, and the Reports & exports workspace. Planned modules are not clickable placeholders.
- The overlay drawer opens from the header on Calendar, Settings, Reports, and Profile with a selected household. It closes on selection, Escape, backdrop click, or its close button; MUI handles focus trapping/restoration. Existing header shortcuts, default calendar route, and calendar layout remain intact.
- Nested entries select existing Settings tabs. They are not new routes: Settings tabs remain session-local, and reload defaults to Members. Back/forward follows existing pathname behavior, not a history of Settings tabs.
- **Assumption: per-family enabling/disabling is deferred.** All shipped destinations remain available. If adopted later, add household-scoped capability settings with enabled-by-default existing behavior; filter navigation and enforce access server-side. Hiding a menu entry is not authorization. Decide how disabling affects existing data and cross-module projections before rollout.
- **Assumption: adapt to module count through registry-driven rows and vertical scrolling**, with an overlay on all screen sizes. No permanent desktop sidebar or auto-switching layout is required. Add grouping/search only if a larger inventory warrants it.

## Step-by-step: add a module

1. **Specify scope first.** Update `docs/PRODUCT_OVERVIEW.md` and add a focused document in `docs/modules/`. State shipped versus planned behavior, ownership, dependencies, permissions, agent workflows, and acceptance criteria. Tasks, for example, would own tasks/board state, not calendar events; Gamification would own reactions rather than task completion.
2. **Design contracts and persistence.** Define household-scoped commands/read results and validation. Add migrations and Supabase RLS as needed using the existing provider abstraction in `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/db`. Maintain provider swappability; never query another module's tables from the UI. Document schema/setup changes in the data model and Supabase docs.
3. **Implement API capabilities.** Follow existing Azure Functions `function.json` + `index.js` handlers and domain helpers such as `api/shared/childcare.js` and `api/shared/parentingTime.js`. Reuse authentication/household authorization and validation. Do not use `app.listen`, introduce Azure Infrastructure-as-Code, or expose service-role keys. Validate access for each requested household and referenced member/entity.
4. **Build feature UI and page composition.** Place Tasks UI under `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/features/tasks/`, and compose it in a page under `frontend/src/pages`. Reuse shared controls/theme and the active household context. Keep task-specific state out of shared `HouseholdData` unless it truly becomes a shared foundation. Include loading, empty, error, retry, and narrow-screen behavior.
5. **Wire navigation only when usable.** Add the page's path to the `App.tsx` route/navigation types and route branch, preserving existing auth/household guards and browser history handling. Add a stable, unique ID/label/path to `ModuleDestination` and `moduleDestinations` in `features/app/modules.ts`; pass the same `ModuleNavigation` header control to the new page and map its active ID. Childcare illustrates nested `settingsTab` destinations instead of top-level modules. Do not advertise Tasks, Shop & Cook, or Gamification as implemented until their real workflows exist.
6. **Integrate narrowly.** For Tasks → Calendar, implement the bounded read and a calendar adapter described above. For a later Gamification release, implement durable committed events and consumer deduplication first. For Bring!, implement the isolated adapter and synchronization policy, not provider calls scattered through components.
7. **Expose agents explicitly.** Follow [Agent Chat Tools Guide](../agentic/AGENTIC_TOOLS_GUIDE.md). Agent tools must reuse the module's authorized commands/queries and confirmations, not bypass permission checks or create separate business rules. Document actual tool coverage; current Childcare/Parenting tools are read-only, and none of the planned modules has agent coverage yet.
8. **Validate and document delivery.** Run `npm install` and `npm run build` from the repository root. Add focused Storybook play coverage matching existing stories; use `npm run storybook --workspace frontend` to exercise it, and `npm run build-storybook --workspace frontend` to check story compilation. For API changes add targeted `node --test` coverage using the existing tests, run `npm run test:api`, and verify `GET /api/health?checks=1` plus authenticated Supabase-backed endpoints in a configured environment. Verify keyboard/mobile navigation and existing calendar operations. Scan changed files for secrets; update the changelog, product status, and UI screenshot.

## Module conventions

- Stable kebab-case module IDs; human-readable labels; explicit distinction between peer modules, nested sub-features, and shared workspaces.
- Feature-first folders, typed public frontend contracts, validated API schemas, and versioned events where consumers need compatibility.
- Shared authentication, explicit household scope, least privilege, server-side authorization/RLS, and no cross-household leakage. Never infer a parenting party from the signed-in user without an authorized mapping.
- Standard theme/form controls, meaningful accessible names, keyboard/focus support, responsive layouts, and honest empty/error states. Follow [Styleguide](../STYLEGUIDE.md).
- No cyclic ownership or module-internal imports across domains. Reuse a small public capability; extract a shared primitive only when real consumers need it.
- Commands own writes; projections/read tools do not silently mutate data. Confirm consequential agent actions using existing conventions.
- Optional integrations fail independently; bound requests, handle stale responses, and minimize sensitive logging.
- Tests cover authorization, validation, failure/retry/idempotency where relevant, and existing behavior. New module rollout must not require migration of unrelated calendar workflows.
