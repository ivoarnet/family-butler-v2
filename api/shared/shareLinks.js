const { createHash, randomBytes } = require("node:crypto");
const { assert, validateId, validateDate } = require("./validation");

const CATEGORIES = ["holiday", "adjusted_handover", "diverse"];
const MAX_LINKS = 500;
const MAX_CHANGES = 500;
const DAY_MS = 86400000;
const CHILDCARE_RESOURCE = "childcare_schedule";
const PUBLIC_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex,nofollow",
  "X-Content-Type-Options": "nosniff",
};

const validateTimestamp = (value, name = "expiresAt") => {
  assert(typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value),
  `${name} must be an ISO timestamp with a time zone`);
  validateDate(value.slice(0, 10), name);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp) && new Date(timestamp).getUTCFullYear() >= 1 &&
    new Date(timestamp).getUTCFullYear() <= 9999, `${name} must be a valid timestamp`);
  return new Date(timestamp).toISOString();
};

const validateCategories = (value) => {
  assert(Array.isArray(value) && value.length > 0 && value.length <= CATEGORIES.length &&
    value.every((category) => CATEGORIES.includes(category)) && new Set(value).size === value.length,
  "categories must contain distinct supported categories");
  return [...value];
};

const localDateInTimeZone = (timestamp, timeZone) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const validateChildcareFilters = (value, expiresAt) => {
  assert(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 4
    && Object.keys(value).every((key) => ["startDate", "endDate", "providerId", "timeZone"].includes(key)),
  "filters must contain startDate, endDate, providerId and timeZone");
  const startDate = validateDate(value.startDate, "startDate");
  const endDate = validateDate(value.endDate, "endDate");
  const providerId = value.providerId == null ? null : validateId(value.providerId, "providerId");
  assert(typeof value.timeZone === "string" && value.timeZone.length <= 100, "invalid time zone");
  try { new Intl.DateTimeFormat("en", { timeZone: value.timeZone }); } catch { assert(false, "invalid time zone"); }
  const nextDate = new Date(Date.parse(`${endDate}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  assert(localDateInTimeZone(Date.parse(expiresAt), value.timeZone) === nextDate,
    "childcare expiry must follow the selected end date");
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  assert(end >= start && (end - start) / DAY_MS < 366, "childcare date range must be ordered and at most 366 days");
  return { startDate, endDate, providerId, timeZone: value.timeZone };
};

const projectParentingChanges = (result, now) => {
  assert(typeof result.timeZone === "string" && result.timeZone.length <= 100, "invalid time zone");
  try { new Intl.DateTimeFormat("en", { timeZone: result.timeZone }); } catch { assert(false, "invalid time zone"); }
  assert(Array.isArray(result.changes) && result.changes.length <= MAX_CHANGES, "invalid changes");
  const expiresAt = validateTimestamp(result.expiresAt);
  const expiry = Date.parse(expiresAt);
  const changes = result.changes.map((change) => {
    assert(change && typeof change === "object", "invalid change");
    const startAt = validateTimestamp(change.startAt, "startAt");
    const endAt = validateTimestamp(change.endAt, "endAt");
    assert(Date.parse(endAt) > Date.parse(startAt) && CATEGORIES.includes(change.category) &&
      typeof change.partyName === "string" && change.partyName.length > 0 && change.partyName.length <= 100 &&
      typeof change.label === "string" && change.label.length > 0 && change.label.length <= 200,
    "invalid change");
    return {
      startAt, endAt: new Date(Math.min(Date.parse(endAt), expiry)).toISOString(),
      partyName: change.partyName, category: change.category, label: change.label,
    };
  }).filter((change) => Date.parse(change.startAt) >= now && Date.parse(change.startAt) < expiry);
  return { resourceType: "parenting_changes", expiresAt, timeZone: result.timeZone, changes };
};

const projectChildcareSchedule = (result) => ({
  resourceType: CHILDCARE_RESOURCE,
  expiresAt: validateTimestamp(result.expiresAt),
  householdId: validateId(result.householdId, "householdId"),
  filters: validateChildcareFilters(result.filters, result.expiresAt),
});

// Resource handlers own their allowlisted public projection; no provider object is returned verbatim.
const resources = new Map([
  ["parenting_changes", { project: projectParentingChanges }],
  [CHILDCARE_RESOURCE, { project: projectChildcareSchedule }],
]);

const validateInput = (body, create, now = Date.now()) => {
  assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
  const allowed = create ? ["resourceType", "expiresAt", "note", "categories", "filters"] : ["expiresAt", "note"];
  assert(Object.keys(body).length > 0 && Object.keys(body).every((key) => allowed.includes(key)),
    "unsupported share-link fields");
  const data = {};
  let expiresAt;
  if (create) {
    assert(resources.has(body.resourceType), "unsupported resourceType");
    data.resourceType = body.resourceType;
  }
  if (create || Object.hasOwn(body, "expiresAt")) {
    expiresAt = validateTimestamp(body.expiresAt);
    data.expiresAt = expiresAt;
    assert(!create || Date.parse(expiresAt) > now, "expiresAt must be in the future");
  }
  if (create) {
    if (body.resourceType === CHILDCARE_RESOURCE) {
      assert(body.categories === undefined || (Array.isArray(body.categories) && body.categories.length === 0),
        "childcare links do not support categories");
      data.categories = [];
      data.filters = validateChildcareFilters(body.filters, expiresAt);
    } else {
      assert(body.filters === undefined, "filters are only supported for childcare links");
      data.categories = validateCategories(body.categories);
      data.filters = {};
    }
  }
  if (Object.hasOwn(body, "note")) {
    assert(typeof body.note === "string" && body.note.length <= 1000 && !body.note.includes("\0"),
      "note must be a string of at most 1000 characters");
    data.note = body.note;
  } else if (create) data.note = "";
  return data;
};

const projectMetadata = (link) => {
  assert(link && typeof link === "object" && resources.has(link.resourceType), "invalid share link");
  assert(typeof link.note === "string" && link.note.length <= 1000, "invalid note");
  assert(Number.isSafeInteger(link.viewCount) && link.viewCount >= 0, "invalid view count");
  const expiresAt = validateTimestamp(link.expiresAt);
  const categories = link.resourceType === CHILDCARE_RESOURCE
    ? (assert(Array.isArray(link.categories) && link.categories.length === 0, "invalid categories"), [])
    : validateCategories(link.categories);
  return {
    id: validateId(link.id, "id"), resourceType: link.resourceType,
    expiresAt, note: link.note, categories,
    ...(link.resourceType === CHILDCARE_RESOURCE
      ? { filters: validateChildcareFilters(link.filters, expiresAt) } : {}),
    createdAt: validateTimestamp(link.createdAt, "createdAt"),
    viewCount: link.viewCount,
  };
};

const validateResolveInput = (body) => {
  if (body === undefined || body === null || body === "") return undefined;
  assert(typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).every((key) => key === "viewId"), "invalid resolve body");
  if (!Object.hasOwn(body, "viewId")) return undefined;
  assert(typeof body.viewId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.viewId),
  "invalid viewId");
  return body.viewId.toLowerCase();
};

const tokenDigest = (token) => createHash("sha256").update(token).digest("hex");
const createToken = () => randomBytes(32).toString("base64url");
const getPublicToken = (headers) => {
  const shareHeaders = Object.keys(headers ?? {}).filter((name) => name.toLowerCase() === "x-share-token");
  let token;
  if (shareHeaders.length) {
    if (shareHeaders.length !== 1) return null;
    token = headers[shareHeaders[0]];
  } else {
    const header = headers?.authorization ?? headers?.Authorization;
    if (typeof header !== "string") return null;
    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
    token = parts[1];
  }
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  if (Buffer.from(token, "base64url").toString("base64url") !== token) return null;
  return token;
};

module.exports = {
  MAX_LINKS, MAX_CHANGES, PUBLIC_HEADERS, resources, validateInput, validateTimestamp,
  CHILDCARE_RESOURCE, validateChildcareFilters, localDateInTimeZone, projectMetadata, validateResolveInput,
  createToken, tokenDigest, getPublicToken,
};
