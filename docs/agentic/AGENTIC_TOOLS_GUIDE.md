# Agent Chat Tools Guide

This guide explains how to add new tools for the Agent Chat backend.

## Current structure

- Tool registry: `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/agent/tools/index.js`
- Existing tools:
  - `/api/shared/agent/tools/checkParentingResponsibilityTool.js`
  - `/api/shared/agent/tools/getChildcareCoverageTool.js`
  - `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/agent/tools/addContactTool.js`
  - `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/agent/tools/getContactsTool.js`
  - `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/agent/tools/getNextBirthdayTool.js`
- Shared schema text:
  - `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/agent/tools/contactModel.js`

## How to add a new tool

1. Create a new tool module in `/api/shared/agent/tools`, following the existing factory pattern:

   - Export a function that receives context (for example `db`, `householdId`, `householdState`, `toClientError`).
   - Return an object with:
     - `definition` (name, description, JSON-schema `parameters`)
     - `execute(args)` (tool runtime logic)

2. Register the tool in `/api/shared/agent/tools/index.js`:

   - Import your tool factory.
   - Add it to `toolModules`.

3. Keep descriptions explicit for the model:

   - State exactly when the tool should be used.
   - Describe required fields and important constraints.

4. Return structured results from `execute`:

   - `ok: true/false`
   - tool-specific payload (for example `contact`, `contacts`, `nextBirthday`)
   - clear `message` text for model follow-up

## Best practices for robust tools

1. **Validate inputs defensively**
   - Treat all tool arguments as untrusted.
   - Validate ranges, formats, and required fields.
   - Use `toClientError(...)` for user-fixable validation failures.

2. **Prefer read tools before write tools**
   - Add generic read tools (`get_*`) to improve model grounding.
   - Keep write tools focused and explicit.

3. **Design write tools with confirmation flow**
   - For risky/ambiguous changes, return `confirmationRequired` before mutating data.
   - Require an explicit confirmation argument in the follow-up call.

4. **Keep tool outputs model-friendly**
   - Return small, predictable JSON shapes.
   - Include enough context for the model to ask good follow-up questions.

5. **Use household-scoped context**
   - Always operate on `householdState`/`householdId` resolved by the API layer.
   - Never bypass ownership checks handled in `/api/agent-chat/index.js`.

6. **Keep tools deterministic**
   - Avoid hidden side effects.
   - Keep business rules in one place to reduce drift between tools.

7. **Ground relative dates with runtime context**
   - The API appends current date/time context to instructions.
   - For date-sensitive tools, assume relative phrases may appear and validate resolved values.

## Childcare coverage

`get_childcare_coverage` accepts an inclusive `fromDate`/`toDate` range (at most 366 days) and returns persisted, resolved occurrences for the authenticated current household. Results include effective dates and times, provider and participating child names, plus original dates and change actions for moved or replaced occurrences. Cancellations are omitted. It is a read-only tool and does not infer parenting-time responsibility or care availability.

## Parenting-time responsibility

`check_parenting_responsibility` is read-only and uses the authorized current household context. Supply an explicit active parenting-party UUID (`partyId`), an inclusive `startAt`, and an exclusive `endAt`, both ISO date-times with a timezone (maximum range: 366 days). The explicit party input is development-only: the agent must ask for a UUID rather than infer “me” from the signed-in user or a name.

The tool and `POST /api/households/{householdId}/parenting-time/check` share the same resolver. A `determined` response includes `responsible` (true for **any** overlap, false for none), `overlaps`, and the full resolved `intervals`, with plan/rule/change provenance. All-day requests must use midnight-to-midnight boundaries in the intended timezone, with an exclusive end at the following midnight.

Missing/inactive plans, invalid persisted schedules, gaps, ambiguity, missing/inactive referenced parties, or ranges partly outside effective dates return `status: "cannot_determine"`, `responsible: null`, and a reason/message. Malformed requests or a requested party outside the active household parties are validation errors, not unknown results. Unknown never means no conflict. This informational tool does not block or change event tools.

`GET /api/households/{householdId}/parenting-time/resolve?startAt=...&endAt=...` returns `{status, intervals, parties, timeZone}` (plus a reason/message for unknown schedules). For a valid plan and a partly covered range, GET preserves the intervals clipped to effective dates while reporting `cannot_determine` with reason `outside_effective_plan`; calendars can show the known portion and an unknown banner. Responsibility checks remain unknown with no overlaps unless the entire range is covered. Unsaved plan preview retains its existing validation and clipped-range behavior.

## Minimal template

```js
module.exports = function createExampleTool({ toClientError }) {
  return {
    definition: {
      name: "example_tool",
      description: "When to use this tool...",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
    },
    async execute(args) {
      if (typeof args?.value !== "string" || !args.value.trim()) {
        throw toClientError("value is required");
      }

      return {
        ok: true,
        message: "Done.",
      };
    },
  };
};
```
