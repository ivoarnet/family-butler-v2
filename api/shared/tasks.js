const { assert, validateId, validateDate } = require("./validation");

const STATUSES = ["todo", "in_progress", "done"];
const REPEAT_RULES = ["none", "daily", "weekly"];
const MAX_COINS = 1000000;
const MAX_REVISION = 2147483646;
const object = (body, fields) => {
  assert(body !== null && typeof body === "object" && !Array.isArray(body), "body must be an object");
  assert(Object.keys(body).every((key) => fields.includes(key)), "unsupported field");
  assert(Buffer.byteLength(JSON.stringify(body), "utf8") <= 4096, "body is too large");
};
const revision = (value) => {
  assert(Number.isInteger(value) && value >= 0 && value <= MAX_REVISION, "revision must be a nonnegative integer");
  return value;
};

const validateMutation = (action, body) => {
  const editable = ["title", "memberId", "coins", "dueDate", "repeatRule"];
  object(body, action === "move" ? ["id", "revision", "status", "beforeId"]
    : action === "delete" ? ["id", "revision"]
      : ["id", ...(action === "update" ? ["revision", "status"] : []), ...editable]);
  const data = {};
  if (action !== "create" || Object.hasOwn(body, "id")) data.id = validateId(body.id, "id");
  if (action !== "create") data.revision = revision(body.revision);
  if (action === "delete") return data;
  if (action === "move") {
    assert(STATUSES.includes(body.status), "invalid status");
    data.status = body.status;
    data.beforeId = body.beforeId == null ? null : validateId(body.beforeId, "beforeId");
    assert(data.beforeId !== data.id, "cannot move before itself");
    return data;
  }
  if (action === "update" && Object.hasOwn(body, "status")) {
    assert(STATUSES.includes(body.status), "invalid status");
    data.status = body.status;
  }
  assert(typeof body.title === "string" && !/[\u0000-\u001f\u007f]/u.test(body.title), "invalid title");
  data.title = body.title.trim();
  assert([...data.title].length >= 1 && [...data.title].length <= 160, "title must contain 1 to 160 characters");
  data.memberId = validateId(body.memberId, "memberId");
  assert(Number.isInteger(body.coins) && body.coins >= 0 && body.coins <= MAX_COINS, "invalid coins");
  data.coins = body.coins;
  assert(Object.hasOwn(body, "dueDate") && (body.dueDate === null || typeof body.dueDate === "string"),
    "dueDate must be a date or null");
  data.dueDate = body.dueDate === null ? null : validateDate(body.dueDate, "dueDate");
  assert(REPEAT_RULES.includes(body.repeatRule), "invalid repeatRule");
  data.repeatRule = body.repeatRule;
  assert(data.repeatRule === "none" || data.dueDate !== null, "recurring tasks require dueDate");
  return data;
};

const validateFilters = (query = {}) => {
  object(query, ["memberId", "status", "startDate", "endDate"]);
  const data = {};
  if (Object.hasOwn(query, "memberId")) data.memberId = validateId(query.memberId, "memberId");
  if (Object.hasOwn(query, "status")) {
    assert([...STATUSES, "open"].includes(query.status), "invalid status");
    data.status = query.status;
  }
  if (Object.hasOwn(query, "startDate") || Object.hasOwn(query, "endDate")) {
    data.startDate = validateDate(query.startDate, "startDate");
    data.endDate = validateDate(query.endDate, "endDate");
    const days = (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86400000;
    assert(days >= 0 && days <= 366, "date range must be ordered and at most 367 inclusive days");
  }
  return data;
};

module.exports = { validateMutation, validateFilters };
