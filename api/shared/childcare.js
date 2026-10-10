const { assert, validateId, validateDate } = require("./validation");
const DAY_MS = 86400000;
const PROVIDER_TYPES = new Set(["grandparent", "individual_carer", "daycare", "school_programme", "other"]);

const validateTiming = (data) => {
  assert(typeof data.allDay === "boolean", "allDay must be a boolean");
  if (data.allDay) {
    assert(data.startTime == null && data.endTime == null, "all-day care must not have times");
    return { allDay: true, startTime: null, endTime: null };
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  assert(typeof data.startTime === "string" && timePattern.test(data.startTime)
    && typeof data.endTime === "string" && timePattern.test(data.endTime),
  "timed care requires startTime and endTime in HH:MM format");
  assert(data.startTime < data.endTime, "endTime must be after startTime (same-day care only)");
  return { allDay: false, startTime: data.startTime, endTime: data.endTime };
};

const validateProvider = (data) => {
  assert(typeof data.name === "string" && data.name.trim().length > 0, "provider name is required");
  assert(PROVIDER_TYPES.has(data.type), "provider type is invalid");
  assert(data.active === undefined || typeof data.active === "boolean", "active must be a boolean");
  return { name: data.name.trim(), type: data.type, active: data.active ?? true };
};

const validateArrangement = (data, providers, memberIds) => {
  const providerId = validateId(data.providerId, "providerId");
  assert(providers.some((provider) => provider.id === providerId), "provider is not part of this household");
  assert(Array.isArray(data.childIds) && data.childIds.length > 0, "childIds must contain at least one household member");
  const childIds = [...new Set(data.childIds.map((id) => validateId(id, "childId")))];
  assert(childIds.every((id) => memberIds.includes(id)), "child is not part of this household");
  assert(Array.isArray(data.weekdays) && data.weekdays.length > 0
    && data.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7),
  "weekdays must contain ISO weekdays 1 (Monday) through 7 (Sunday)");
  const startDate = validateDate(data.startDate, "startDate");
  const endDate = data.endDate == null ? null : validateDate(data.endDate, "endDate");
  assert(!endDate || endDate >= startDate, "endDate must be on or after startDate");
  return {
    providerId, childIds, weekdays: [...new Set(data.weekdays)].sort(),
    startDate, endDate, ...validateTiming(data),
  };
};

const isScheduled = (arrangement, date) => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return date >= arrangement.startDate && (!arrangement.endDate || date <= arrangement.endDate)
    && arrangement.weekdays.includes(weekday);
};

const effectiveTiming = (arrangement, override) => override?.allDay == null
  ? { allDay: arrangement.allDay, startTime: arrangement.startTime, endTime: arrangement.endTime }
  : { allDay: override.allDay, startTime: override.startTime, endTime: override.endTime };

const validateOverride = (data, arrangements, providers, overrides = []) => {
  const arrangementId = validateId(data.arrangementId, "arrangementId");
  const arrangement = arrangements.find((item) => item.id === arrangementId);
  assert(arrangement, "arrangement is not part of this household");
  const originalDate = validateDate(data.originalDate, "originalDate");
  assert(["add", "cancel", "replace", "move"].includes(data.action), "override action is invalid");
  const scheduled = isScheduled(arrangement, originalDate);
  const existingAddedDay = overrides.some((item) => item.arrangementId === arrangementId
    && item.originalDate === originalDate && item.action === "add");
  assert(data.action === "add" ? (!scheduled || existingAddedDay) : scheduled || (data.action === "cancel" && existingAddedDay),
    data.action === "add" ? "added date is already a scheduled occurrence" : "originalDate is not a scheduled occurrence");
  const movedDate = data.action === "move" ? validateDate(data.movedDate, "movedDate") : null;
  assert(data.action === "move" || data.movedDate == null, "only move overrides may have movedDate");
  if (movedDate) {
    assert(movedDate !== originalDate, "movedDate must differ from originalDate");
  }
  const providerId = data.providerId == null ? null : validateId(data.providerId, "providerId");
  assert(!providerId || providers.some((provider) => provider.id === providerId),
    "provider is not part of this household");
  const hasTiming = ["allDay", "startTime", "endTime"].some((key) => Object.hasOwn(data, key));
  assert(data.action !== "cancel" || (!providerId && !hasTiming), "cancel overrides cannot replace provider or time");
  assert(data.action !== "replace" || providerId || hasTiming, "replace requires a provider or time change");
  let timing = { allDay: null, startTime: null, endTime: null };
  if (hasTiming) {
    const allDay = data.allDay === undefined ? arrangement.allDay : data.allDay;
    timing = validateTiming({
      allDay,
      startTime: allDay ? data.startTime : data.startTime === undefined ? arrangement.startTime : data.startTime,
      endTime: allDay ? data.endTime : data.endTime === undefined ? arrangement.endTime : data.endTime,
    });
  }
  return { arrangementId, originalDate, action: data.action, movedDate, providerId, ...timing };
};

const resolveOccurrences = ({ arrangements, overrides }, startDate, endDate) => {
  validateDate(startDate, "startDate");
  validateDate(endDate, "endDate");
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  assert(end >= start && (end - start) / DAY_MS < 366, "date range must be ordered and at most 366 days");
  const overrideMap = new Map(overrides.map((item) => [`${item.arrangementId}:${item.originalDate}`, item]));
  const occurrences = [];
  const add = (arrangement, originalDate, override) => {
    if (override?.action === "cancel") return;
    const date = override?.action === "move" ? override.movedDate : originalDate;
    if (date < startDate || date > endDate) return;
    occurrences.push({
      id: `${arrangement.id}:${originalDate}`,
      householdId: arrangement.householdId,
      arrangementId: arrangement.id,
      originalDate,
      date,
      providerId: override?.providerId ?? arrangement.providerId,
      childIds: arrangement.childIds,
      ...effectiveTiming(arrangement, override),
      overrideAction: override?.action ?? null,
    });
  };
  for (const arrangement of arrangements) {
    for (let timestamp = start; timestamp <= end; timestamp += DAY_MS) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      if (isScheduled(arrangement, date)) {
        add(arrangement, date, overrideMap.get(`${arrangement.id}:${date}`));
      }
    }
    for (const override of overrides) {
      if (override.arrangementId === arrangement.id && override.action === "add"
        && !isScheduled(arrangement, override.originalDate)
        && override.originalDate >= startDate && override.originalDate <= endDate) {
        add(arrangement, override.originalDate, override);
      } else if (override.arrangementId === arrangement.id && override.action === "move"
        && (override.originalDate < startDate || override.originalDate > endDate)
        && isScheduled(arrangement, override.originalDate)) {
        add(arrangement, override.originalDate, override);
      }
    }
  }
  return occurrences.sort((a, b) => a.date.localeCompare(b.date)
    || (a.startTime || "").localeCompare(b.startTime || "") || a.id.localeCompare(b.id));
};

module.exports = {
  assert, validateId, validateProvider, validateArrangement, validateOverride, resolveOccurrences, isScheduled,
};
