# Agent Chat Tools Guide

This guide explains how to add new tools for the Agent Chat backend.

## Current structure

- Tool registry: `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/agent/tools/index.js`
- Existing tools:
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
