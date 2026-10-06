# Data Model Plan

## Recorded decisions

- Database: Supabase PostgreSQL
- API data access: provider abstraction in `/api/shared/db` (current provider: Supabase)
- Tenancy: multi-tenant; every household-owned table is scoped by `householdId`
- Household-owned models: `HouseholdMember`, `Contact`, `EventCategory`, `Event`, `DayConfiguration`, `ChildcareProvider`, `ChildcareArrangement`, `ChildcareOverride`
- Event recurrence format: RFC 5545 `RRULE` strings; childcare uses explicit weekly weekdays (see below).
- Calendar annotations (public holidays, bridge days, school holidays, custom days): unified `DayConfiguration` model
- Terminology: use `HouseholdMember` (not `FamilyMember`)

## Mermaid ERD

```mermaid
erDiagram
    HOUSEHOLD ||--o{ HOUSEHOLD_MEMBER : has
    HOUSEHOLD ||--o{ CONTACT : has
    HOUSEHOLD ||--o{ EVENT_CATEGORY : has
    HOUSEHOLD ||--o{ EVENT : has
    HOUSEHOLD ||--o{ DAY_CONFIGURATION : configures
    HOUSEHOLD_MEMBER ||--o{ EVENT : "shown under"
    CONTACT o|--o{ EVENT : "optionally linked"
    EVENT_CATEGORY ||--o{ EVENT : categorizes
    DAY_CONFIGURATION o|--o{ DAY_CONFIGURATION : "may be derived from"
```

## Notes

- For concrete SQL table definitions currently used by the app (`households`, `household_members`, `contacts`, `tasks`), see `/home/runner/work/family-butler-v2/family-butler-v2/docs/SUPABASE.md`.
- Event type and event entities are now persisted via `event_types` and `events` tables (household-scoped with `ON DELETE CASCADE` on household deletion).
- Day configurations are persisted in the `day_configurations` table and are available through the household API and agent tools.
- Service-layer validation must enforce same-household consistency for cross-table references.

## Childcare — implemented

Childcare is separate from `Event` records. Apply `docs/sql/childcare.sql` after the core Supabase schema.

### Persisted model

- `childcare_providers`: household-owned named provider with type `grandparent`, `individual_carer`, `daycare`, `school_programme`, or `other`, and an `active` boolean (default true). Providers are independent of contacts. Deactivation hides a provider from new selections, not from existing arrangements or resolved care; reactivate it to select it again.
- `childcare_arrangements`: provider, nonempty `childIds` (household member UUIDs), nonempty `weekdays` (ISO Monday = 1 through Sunday = 7), inclusive `startDate`, optional inclusive `endDate`, and `allDay`/`startTime`/`endTime`. One arrangement can cover multiple weekdays and multiple children, all sharing its provider and times. Different times require separate arrangements. There is no new child-role classification; callers choose participating household members.
- `childcare_overrides`: one row per `(householdId, arrangementId, originalDate)`, with action `add`, `cancel`, `replace`, or `move`. For cancel/replace/move, `originalDate` must be a date in the arrangement's weekly schedule. An `add` uses `originalDate` as an extra care date outside the weekly schedule, and inherits the chosen arrangement's provider, children, and timing (optional provider/timing fields can customize it). `move` requires a different `movedDate`; replacement provider and timing are optional for moves. `replace` requires provider and/or timing changes. Repeated writes replace that occurrence's entire override, not the weekly arrangement.
- All-day care has null times. Timed care requires increasing same-day `HH:MM` times. Overnight care is not supported. Dates and times are household-local wall-clock values, not UTC instants; the resolver uses UTC date arithmetic only to avoid timezone/DST drift.
- This first iteration deliberately supports simple weekly recurrence rather than RRULE parsing, alternating weeks, or holiday exclusions. Special days do not automatically cancel care.

Composite foreign keys enforce same-household providers and arrangements. SQL triggers validate household children and override source dates. Child validation and member deletion/transfer share a household-level transaction lock to prevent concurrent writes from leaving dangling references. Deleting or transferring a referenced member is rejected until its childcare arrangements are removed; household deletion still cascades. Childcare RLS allows authenticated household owners only, matching `households.created_by_user_id`. Azure Functions additionally authenticate and check ownership before accessing the server-side provider.

### API

All paths below are relative to `/api/households/{householdId}/childcare`; use the same Supabase bearer token or `x-supabase-auth-token` header as the household API. IDs in responses are server-generated UUIDs. Request-body IDs and `householdId` cannot override route scoping.

| Method | Suffix | Behavior |
| --- | --- | --- |
| GET | (none) | Reload persisted `{ providers, arrangements, overrides }`. |
| POST | `/providers` | Create `{ "name": "Grandparents", "type": "grandparent" }`. |
| PUT | `/providers` | Edit `{ id, name, type, active }`; deactivate/reactivate with `active: false/true`. |
| POST | `/arrangements` | Create a validated weekly arrangement (example below). |
| PUT | `/arrangements` | Edit a weekly arrangement using `id` and all arrangement fields. |
| POST | `/preview` | Resolve a draft without writing: `{ arrangement, startDate, endDate }` → `{ occurrences }`. Include the existing arrangement `id` when editing to apply its saved overrides. Range limit is 366 days, as for `/occurrences`. |
| PUT | `/overrides` | Set or replace one scheduled occurrence's change, or add a date to an arrangement outside its weekly schedule. |
| GET | `/occurrences?startDate=2026-10-01&endDate=2026-10-31` | Return `{ occurrences }` for an inclusive range of at most 366 days. |

Create an arrangement using the returned provider UUID and existing member UUIDs:

```json
{
  "providerId": "<provider UUID>",
  "childIds": ["<child member UUID>", "<another child member UUID>"],
  "weekdays": [1, 3],
  "startDate": "2026-10-01",
  "endDate": null,
  "allDay": false,
  "startTime": "11:45",
  "endTime": "13:30"
}
```

For all-day care, use `"allDay": true` and omit both times. Example occurrence overrides:

```json
{ "arrangementId": "<arrangement UUID>", "originalDate": "2026-10-06", "action": "add" }
```

The added day inherits the arrangement's provider, children, and timing. It can optionally specify `providerId` and timing fields to customize that date. To remove it, replace the same unscheduled date's override with `"action": "cancel"`.

```json
{ "arrangementId": "<arrangement UUID>", "originalDate": "2026-10-05", "action": "cancel" }
```

```json
{
  "arrangementId": "<arrangement UUID>",
  "originalDate": "2026-10-05",
  "action": "replace",
  "providerId": "<replacement provider UUID>",
  "allDay": false,
  "startTime": "12:00",
  "endTime": "14:00"
}
```

```json
{
  "arrangementId": "<arrangement UUID>",
  "originalDate": "2026-10-05",
  "action": "move",
  "movedDate": "2026-11-03"
}
```

Provider-only changes inherit normal timing. A partial timed change inherits omitted times from the arrangement; switching from all-day to timed care requires both times. Switching to all-day clears times. Cancelling cannot include provider/time replacements.

### Resolution and boundaries

The occurrences endpoint reads persisted arrangements and overrides, never generic events. The preview endpoint validates a supplied draft against household providers and members, then uses the same resolver with that draft and any existing overrides; it does not save anything. An added day resolves at its own date without changing the arrangement's weekly schedule or effective date bounds. Cancellation removes only its occurrence. Replacement preserves the original date. A move suppresses the original date and appears at its destination even when the source date is outside the requested range or the destination is beyond the arrangement's normal bounds. The stable occurrence ID is `<arrangementId>:<originalDate>` (new unsaved previews use `preview` as the arrangement ID). Results contain `householdId`, `arrangementId`, `originalDate`, effective `date`, `providerId`, `childIds`, timing, and nullable `overrideAction`, sorted by effective date, start time, and ID. The authenticated occurrences API also provides the resolved provider name for calendar display.

Overlapping arrangements and moves onto another scheduled day remain separate occurrences; no capacity/conflict inference is performed. Arrangement edits retain saved overrides. Changing weekdays or effective dates to exclude an override's original date is rejected both by the API (including previews) and the database, rather than silently discarding the change.

Settings → Childcare exposes provider management, weekly arrangement editing with multiple children, draft previews, upcoming single-occurrence changes, and the ability to add a date to a selected arrangement. Historical resolved care is read-only in Settings. Provider schedules offer chronological lists and monthly calendars for custom inclusive ranges up to 366 days and selection of active or inactive providers. Filtering uses the effective `providerId` from persisted resolved occurrences, not the base arrangement provider; moved and replacement care therefore appears under the effective provider/date, including moves from outside the range. Both views preserve shared children, timing, and one-off labels. The household calendar displays resolved all-day and timed childcare for its visible range, including provider, children, and one-off changes. The read-only `get_childcare_coverage` agent tool returns explainable resolved coverage for a requested range. The current model has no descriptive arrangement name or notes. Cancelled occurrences are listed separately because they are excluded from resolved care. Deleting arrangements and clearing overrides are not exposed. Ordinary household saves do not replace childcare data.

Arrangement saving requires a successful preview. Changing the draft or preview dates invalidates that preview; review the refreshed results before saving. Previews are advisory rather than reservations or conflict checks.

Run focused regression tests from the repository root with `npm run test:api`; run `npm run build` for workspace build verification. Tests cover weekly resolution, multiple children, added days, cancellations/replacements/moves, range boundaries, invalid input, household authorization, provider paging, provider activation/editing, arrangement editing, non-persisting previews, API persistence/reload, and existing health/household reads using a mocked Supabase transport.
