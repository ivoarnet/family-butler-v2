# Modular architecture and developer guide

## Status and scope

Family Butler is a **modular monolith**: one React application, one Azure Functions API, and provider-based persistence. The navigation registry, left drawer, and Shop & Cook grocery module are implemented. No plugin loader, separate servers, event broker, or Azure infrastructure is introduced. Cross-module contracts below remain design guidance unless explicitly marked implemented.

The [product overview](../PRODUCT_OVERVIEW.md) remains the canonical module/status index.

| Module / capability | Ownership and status |
| --- | --- |
| Family Calendar | Existing default `/` workspace, labelled **Calendar** in navigation; owns household events and calendar presentation. |
| Childcare | Shipped Family Calendar sub-feature; owns providers, arrangements, overrides, and resolved coverage. Settings → Childcare and calendar display remain unchanged. |
| Shared Parenting | Shipped Family Calendar sub-feature, named **Parenting Time** in existing Settings/API; owns parties, schedules, changes, and resolved responsibility. This concept does not rename existing UI or APIs. |
| Reports & exports | Existing `/reports` workspace; actual reports/downloads are still planned. Accessed through the existing header shortcut, not module navigation. |
| Tasks | Planned independent module: member-assigned Kanban tasks with due dates; provides due-task summaries to Calendar. A disabled **Tasks — Coming soon** navigation entry is present, but no Tasks workflow is implemented. |
| Shop & Cook | Household grocery lists/items and optional Bring! synchronization through a server-side adapter; cooking/recipes and agent coverage remain planned. |
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

### External integrations

Shop & Cook owns the Bring! integration behind a server-side adapter, separate from its list domain. Keep tokens/credentials server-side in approved secret stores, never frontend settings or event payloads. The community client is not an official Bring! API contract; availability is not assumed.

Define per-household external list/item mappings, least-privilege consent and disconnect/revocation, conflict/deletion policies, retry and rate-limit handling, idempotent writes, and sync-origin markers to avoid echo loops. Authenticate any webhook and verify signatures/replay protection if supported. Provider outages must leave local lists usable and expose synchronization status. Agents call the same permission-checked product capability, not external providers directly.

## Navigation and open-question assumptions

- `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/features/app/modules.ts` is the implemented ordered **main-module-only** registry. Calendar links to `/`; Shop & Cook has its own grocery workspace; Tasks has no path and is disabled with a **Coming soon** label. Gamification is not listed yet.
- The narrow, icon-only MUI `SwipeableDrawer` centers module icons vertically, with accessible names and tooltips (including Tasks' **Coming soon** status). The active module's header icon opens it, replacing the separate hamburger button and decorative calendar badge. Header and drawer icons share the module registry's `icon` definition; auxiliary workspaces without an active module fall back to the Calendar icon. The trigger is available on Calendar, Settings, Reports, and Profile with a selected household. The overlay closes on selection, swipe, Escape, backdrop click, or its close button; focus is trapped inside and restored to the opening control after dismissal. Existing header shortcuts, default calendar route, and calendar layout remain intact.
- Childcare and Shared Parenting remain Calendar sub-features, accessible through existing Settings tabs rather than side navigation. Reports & exports remains a workspace accessed through its existing header shortcut. Settings tabs remain local to Settings, and reload defaults to Members. Back/forward follows existing pathname behavior, not a history of Settings tabs.
- **Assumption: per-family enabling/disabling is deferred.** All shipped destinations remain available. If adopted later, add household-scoped capability settings with enabled-by-default existing behavior; filter navigation and enforce access server-side. Hiding a menu entry is not authorization. Decide how disabling affects existing data and cross-module projections before rollout.
- **On-demand navigation on every screen size:** no permanently open desktop rail or reserved content margin. A small, vertically centered left-edge notch supports click, keyboard activation, and an inward pointer drag (mouse or touch). Touch edge swiping remains available through MUI. The overlay itself uses the existing translucent `--menu-surface`, backdrop blur, border, and shadow tokens for a glassmorphism appearance in light/dark themes; the content remains visible through it. Icons stay vertically centered, and navigation scrolls if more modules exceed the available height.

## Step-by-step: add a module

1. **Specify scope first.** Update `docs/PRODUCT_OVERVIEW.md` and add a focused document in `docs/modules/`. State shipped versus planned behavior, ownership, dependencies, permissions, agent workflows, and acceptance criteria. Tasks, for example, would own tasks/board state, not calendar events; Gamification would own reactions rather than task completion.
2. **Design contracts and persistence.** Define household-scoped commands/read results and validation. Add migrations and Supabase RLS as needed using the existing provider abstraction in `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/db`. Maintain provider swappability; never query another module's tables from the UI. Document schema/setup changes in the data model and Supabase docs.
3. **Implement API capabilities.** Follow existing Azure Functions `function.json` + `index.js` handlers and domain helpers such as `api/shared/childcare.js` and `api/shared/parentingTime.js`. Reuse authentication/household authorization and validation. Do not use `app.listen`, introduce Azure Infrastructure-as-Code, or expose service-role keys. Validate access for each requested household and referenced member/entity.
4. **Build feature UI and page composition.** Place Tasks UI under `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/features/tasks/`, and compose it in a page under `frontend/src/pages`. Reuse shared controls/theme and the active household context. Keep task-specific state out of shared `HouseholdData` unless it truly becomes a shared foundation. Include loading, empty, error, retry, and narrow-screen behavior.
5. **Wire main-module navigation.** Add the page's path to the `App.tsx` route/navigation types and route branch, preserving existing auth/household guards and browser history handling. Add a stable, unique ID/label/icon/path to `ModuleDestination` and `moduleDestinations` in `features/app/modules.ts`; the registry icon is used in both the header trigger and drawer. Pass the header control to the new page and map its active ID. Sub-features such as Childcare remain in Settings, not in this menu. An announced planned module can omit its path to show a disabled **Coming soon** entry (as Tasks does now). Assign a route only when its real workflow is usable; do not advertise planned functionality as implemented.
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

## Shop & Cook implementation

Grocery lists are the first Shop & Cook feature, not a generic Lists framework. The feature owns its API, persistence, pending synchronization state, and UI. It reuses Supabase authentication and the existing household-owner authorization; household members do not automatically gain login access. No new agent tools are shipped.

The workspace adds items inline without a dialog. Item tiles are grouped into **To buy** (unchecked) and **Last used** (checked); clicking a card toggles its state without a visible checkbox or flag. Card toggles support Enter/Space and expose their state to assistive technology. Edit/remove actions remain separate and do not toggle the item. Editing existing items still uses a dialog. These sections derive from the existing checked state, not a separate history table or recency timestamp.

Grocery images come from Bring's catalog and item-detail metadata, not hardcoded product-name mappings. Synchronization stores validated `iconId` / `imageUrl` references alongside items. Metadata is optional: unavailable metadata must not block item synchronization or discard previously cached references. Local items without provider metadata and failed image loads use a local shopping icon.

Only safe icon identifiers and HTTPS image references under `https://web.getbring.com/assets/images/items/` are rendered; other image hosts and arbitrary URLs are rejected. Images are not bundled or copied into this repository, and their use remains subject to the provider's terms. Requests omit cross-origin credentials and referrers; Bring! still receives the visitor's IP address and the requested icon identifier. Free-text item names, quantities, household IDs, and credentials are never used to construct icon URLs. No icon request is required for local list operations.

The HTTP base is `/api/households/{householdId}/groceries`:

| Method/resource | Behavior |
| --- | --- |
| `GET` base | Lists with active items, sync status, and `bringConfigured`; does not contact Bring!. |
| `POST lists` | Creates a local list with `name`. |
| `PUT lists` | Updates a list by `id`; optional `name` and `remoteId` (null disconnects). Linking verifies the configured account can access the remote list. |
| `DELETE lists` | Deletes a local list by `id` and cascades its local items/history. Idempotent; leaves Bring! untouched and rejects an active synchronization lease with a retryable conflict. |
| `POST items` | Adds an item with `listId`, `name`, optional `specification`/`checked`. |
| `PUT items` | Changes an item by `listId`/`id`; fields omitted from the request remain unchanged. |
| `DELETE items` | Removes an item by `listId`/`id`; retains pending remote deletion state. |
| `GET bring-lists` | Lists available remote lists; returns a safe unavailable response on provider failure. |
| `POST sync` | Synchronizes `listId`; inspect `syncStatus`, since a provider outage is returned as `unavailable` without losing local changes. |
| `GET connection` | Returns only `configured`, `source` (`stored`, `environment`, or null), and `canConfigure`; does not contact Bring! or reveal credentials. |
| `PUT connection` | Verifies `{mail,password}`, encrypts credentials server-side, and unlinks old list mappings. Requires a valid server encryption key. |
| `DELETE connection` | Disables the connection, suppresses environment fallback, and unlinks lists without deleting local or remote content. |
| `POST connection-test` | Tests the currently configured account, returning `connected` without credential readback. |

Mutations return `ok`/`id`; refresh the base read afterward. POST accepts an optional client-generated UUID for retry identity, and updates accept an optional `revision` for compare-and-swap. The API returns 401 without authentication, 404 for an inaccessible household, and retryable 409 for stale/busy state.

`api/shared/bring.js` is the replaceable server-side client interface:

- `listLists()` returns remote list IDs/names for linking.
- `getItems(remoteId)` returns a complete snapshot of names, specifications, and checked states.
- `saveItem(remoteId, item)` sets an item's desired state.
- `removeItem(remoteId, name)` removes an item by its remote identity.

The adapter uses the MIT-licensed [`bring-shopping`](https://github.com/foxriver76/node-bring-api) 2.0.1 Node client (Node 18+, no runtime dependencies), not handwritten Bring! HTTP requests. This is a community integration, not an endorsed or guaranteed official API. Operators must ensure their account use complies with Bring!'s current terms. Its published API does not expose list creation: create remote lists in Bring! and link/import them locally. The adapter encodes form values, rejects malformed snapshots, bounds waits, and redacts provider exceptions.

Local changes are durable before synchronization, with pending local edits winning conflicts on the same item. Outbound operations are retried as desired-state writes, not appended transactions. Renames remove the previous remote name; removal is distinct from check-off. Inbound snapshots use Bring!'s item name as the identity and never create a second item for a known name. Bring! recent items map to checked items; its check-off API can clear specifications remotely, so existing local quantity text is preserved when a checked remote item has blank detail.

Unconfirmed deletions and renames remain pending until verified. Confirmed deletion/old-name history is retained for a ten-minute grace period to reconcile delayed provider writes, then cleaned at the next synchronization. Deliberate re-adds in Bring! during that grace period are indistinguishable from delayed writes and can be removed again; re-add after expiry or explicitly add locally to restore the item. After history expiry, remote re-adds import normally. The SDK cannot cancel an already-issued request, and Bring! exposes no item revision for distinguishing delayed field changes from genuine remote edits.

Sync validates writes by reading the provider back before acknowledging them: the client does not reliably expose HTTP write status. Provider failures leave local lists usable and pending changes intact. Background polling requires a timer-capable Functions host (see [setup](../SUPABASE.md#groceries-and-bring)); the UI also exposes manual synchronization. Remote list names are not automatically renamed from local list labels.

Shop & Cook settings use the same household-owner authorization as grocery commands. Credential storage is service-only and encrypted with AES-256-GCM under `BRING_CREDENTIALS_KEY`; the UI never reads credentials back or stores them in browser persistence. Stored connections take precedence over `BRING_ACCOUNTS_JSON`; a disconnected marker suppresses that fallback. Replacing/disconnecting an account unlinks existing mappings atomically and rejects changes during an active synchronization lease. Individual list disconnect still only removes that list's mapping. Revoke Bring! account access in the provider itself if required; disconnecting Family Butler does not revoke other applications' sessions.
