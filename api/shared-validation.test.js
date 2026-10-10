const test = require("node:test");
const assert = require("node:assert/strict");
const { validateId, validateDate } = require("./shared/validation");

test("shared ID validation normalizes UUIDs and preserves client errors", () => {
  assert.equal(validateId("ABCDEFAB-1234-5678-9ABC-DEF012345678", "memberId"),
    "abcdefab-1234-5678-9abc-def012345678");
  assert.throws(() => validateId("not-a-uuid", "memberId"), {
    status: 400,
    message: "memberId must be a UUID",
  });
});

test("shared date validation accepts valid date-only values and rejects invalid dates", () => {
  assert.equal(validateDate("2024-02-29", "date"), "2024-02-29");
  for (const date of ["2023-02-29", "2024-2-09", "0000-01-01"]) {
    assert.throws(() => validateDate(date, "date"), {
      status: 400,
      message: "date must be a valid YYYY-MM-DD date",
    });
  }
});
