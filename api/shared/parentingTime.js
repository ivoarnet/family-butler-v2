const { randomUUID } = require("crypto");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86400000;
const assert = (condition, message) => {
  if (!condition) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
};

const validateId = (value, name) => {
  assert(typeof value === "string" && UUID.test(value), `${name} must be a UUID`);
  return value.toLowerCase();
};

const validateDate = (value, name) => {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000"),
    `${name} must be a valid YYYY-MM-DD date`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  assert(Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value,
    `${name} must be a valid YYYY-MM-DD date`);
  return value;
};

const validateDateTime = (value, name) => {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value),
    `${name} must be an ISO 8601 date-time with a timezone`);
  validateDate(value.slice(0, 10), name);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `${name} must be a valid ISO 8601 date-time`);
  return timestamp;
};

const validateParty = (data, memberIds = []) => {
  assert(typeof data?.name === "string" && data.name.trim().length > 0, "party name is required");
  assert(data.name.trim().length <= 100, "party name must be 100 characters or fewer");
  const memberId = data.memberId == null ? null : validateId(data.memberId, "memberId");
  assert(memberId === null || memberIds.includes(memberId), "memberId is not a household member");
  return { name: data.name.trim(), memberId };
};

const validTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch (_error) {
    return false;
  }
};

const isoWeekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

const isoWeekNumber = (date) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil((((day.getTime() - yearStart) / DAY_MS) + 1) / 7);
};

const validateRule = (rule, index, parties, recurrenceMode) => {
  assert(rule && typeof rule === "object" && !Array.isArray(rule), `rules[${index}] must be an object`);
  const id = rule.id == null ? randomUUID() : validateId(rule.id, `rules[${index}].id`);
  const partyId = validateId(rule.partyId, `rules[${index}].partyId`);
  assert(parties.some((party) => party.id === partyId), `rules[${index}].partyId is not a parenting party in this household`);
  assert(Number.isInteger(rule.weekday) && rule.weekday >= 1 && rule.weekday <= 7,
    `rules[${index}].weekday must be an ISO weekday from 1 to 7`);
  assert(Number.isInteger(rule.endWeekday) && rule.endWeekday >= 1 && rule.endWeekday <= 7,
    `rules[${index}].endWeekday must be an ISO weekday from 1 to 7`);
  assert(typeof rule.startTime === "string" && TIME.test(rule.startTime), `rules[${index}].startTime must be HH:MM`);
  assert(typeof rule.endTime === "string" && TIME.test(rule.endTime), `rules[${index}].endTime must be HH:MM`);
  const startMinute = (rule.weekday - 1) * 1440 + Number(rule.startTime.slice(0, 2)) * 60 + Number(rule.startTime.slice(3));
  let endMinute = (rule.endWeekday - 1) * 1440 + Number(rule.endTime.slice(0, 2)) * 60 + Number(rule.endTime.slice(3));
  if (endMinute <= startMinute) endMinute += 7 * 1440;
  assert(endMinute - startMinute < 7 * 1440, `rules[${index}] must end within seven days`);
  const weekParity = rule.weekParity ?? null;
  assert(recurrenceMode === "alternating" ? [null, "odd", "even"].includes(weekParity) : weekParity === null,
    `rules[${index}].weekParity must be null${recurrenceMode === "alternating" ? ", odd, or even" : ""}`);
  return { id, partyId, weekday: rule.weekday, startTime: rule.startTime, endWeekday: rule.endWeekday,
    endTime: rule.endTime, weekParity };
};

const validateHandovers = (handovers, parties) => {
  assert(Array.isArray(handovers) && handovers.length > 0 && handovers.length <= 100,
    "handovers must be an array with between 1 and 100 entries");
  const result = handovers.map((handover, index) => {
    assert(handover && typeof handover === "object" && !Array.isArray(handover),
      `handovers[${index}] must be an object`);
    const id = handover.id == null ? randomUUID() : validateId(handover.id, `handovers[${index}].id`);
    const fromPartyId = validateId(handover.fromPartyId, `handovers[${index}].fromPartyId`);
    const toPartyId = validateId(handover.toPartyId, `handovers[${index}].toPartyId`);
    assert(parties.some((party) => party.id === fromPartyId && party.active !== false),
      `handovers[${index}].fromPartyId must be an active parenting party in this household`);
    assert(parties.some((party) => party.id === toPartyId && party.active !== false),
      `handovers[${index}].toPartyId must be an active parenting party in this household`);
    assert(fromPartyId !== toPartyId, `handovers[${index}] must change parenting parties`);
    assert(Number.isInteger(handover.weekday) && handover.weekday >= 1 && handover.weekday <= 7,
      `handovers[${index}].weekday must be an ISO weekday from 1 to 7`);
    assert(typeof handover.time === "string" && TIME.test(handover.time),
      `handovers[${index}].time must be HH:MM`);
    const weekParity = handover.weekParity ?? null;
    assert([null, "odd", "even"].includes(weekParity),
      `handovers[${index}].weekParity must be null, odd, or even`);
    return { id, weekday: handover.weekday, time: handover.time, fromPartyId, toPartyId, weekParity };
  });
  assert(new Set(result.map((handover) => handover.id)).size === result.length, "handover IDs must be unique");
  return result;
};

const compileHandovers = (handovers) => {
  const weekMinutes = 7 * 1440;
  const cycleMinutes = 2 * weekMinutes;
  const assertContinuousHandoverSequence = (parityForWeek) => {
    const sequence = [];
    for (let week = -3; week <= 3; week += 1) {
      const weekParity = parityForWeek(week);
      for (const handover of handovers) {
        if (handover.weekParity && handover.weekParity !== weekParity) continue;
        const [hour, minute] = handover.time.split(":").map(Number);
        sequence.push({
          at: week * weekMinutes + (handover.weekday - 1) * 1440 + hour * 60 + minute,
          fromPartyId: handover.fromPartyId,
          toPartyId: handover.toPartyId,
        });
      }
    }
    sequence.sort((left, right) => left.at - right.at);
    for (let index = 1; index < sequence.length; index += 1) {
      const previous = sequence[index - 1];
      const current = sequence[index];
      assert(previous.at !== current.at, "only one parenting-time handover can occur at a time");
      assert(previous.toPartyId === current.fromPartyId,
        "handover from-party must match the party responsible after the previous handover");
    }
    return sequence;
  };
  const occurrences = [];
  const regularSequence = assertContinuousHandoverSequence((week) =>
    ((week % 2) + 2) % 2 === 0 ? "odd" : "even");
  const isoYearBoundarySequence = assertContinuousHandoverSequence((week) => {
    if (week === 0) return "odd";
    if (week < 0) return (-week) % 2 === 1 ? "odd" : "even";
    return week % 2 === 0 ? "odd" : "even";
  });
  assert(regularSequence.length > 0 && isoYearBoundarySequence.length > 0, "handovers must define a recurring sequence");
  for (let week = -3; week <= 3; week += 1) {
    const weekParity = ((week % 2) + 2) % 2 === 0 ? "odd" : "even";
    for (const handover of handovers) {
      if (handover.weekParity && handover.weekParity !== weekParity) continue;
      const [hour, minute] = handover.time.split(":").map(Number);
      occurrences.push({
        at: week * weekMinutes + (handover.weekday - 1) * 1440 + hour * 60 + minute,
        fromPartyId: handover.fromPartyId,
        toPartyId: handover.toPartyId,
        id: handover.id,
      });
    }
  }
  occurrences.sort((left, right) => left.at - right.at);
  const events = occurrences.filter(({ at }) => at >= 0 && at < cycleMinutes);
  const boundaries = [...new Set([0, weekMinutes, cycleMinutes, ...events.map(({ at }) => at)])].sort((a, b) => a - b);
  const rules = [];
  const maxPeriodMinutes = 6 * 1440;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    let start = boundaries[index];
    const end = boundaries[index + 1];
    const previousEvent = [...occurrences].reverse().find(({ at }) => at <= start);
    assert(previousEvent, "handovers must establish a responsible parenting party before the plan cycle begins");
    const partyId = previousEvent.toPartyId;
    while (start < end) {
      const periodEnd = Math.min(end, start + maxPeriodMinutes);
      const weekIndex = Math.floor(start / weekMinutes);
      const weekStart = weekIndex * weekMinutes;
      const startInWeek = start - weekStart;
      const endInWeek = periodEnd - weekStart;
      const startDay = Math.floor(startInWeek / 1440) + 1;
      const normalizedEnd = endInWeek % weekMinutes;
      const endDay = Math.floor(normalizedEnd / 1440) + 1;
      const timeFromMinutes = (minutes) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      rules.push({
        id: randomUUID(),
        partyId,
        weekday: startDay,
        startTime: timeFromMinutes(startInWeek),
        endWeekday: endDay,
        endTime: timeFromMinutes(normalizedEnd),
        weekParity: weekIndex % 2 === 0 ? "odd" : "even",
      });
      start = periodEnd;
    }
  }
  return rules;
};

const ruleEndOffset = (rule) => (rule.endWeekday - rule.weekday + 7) % 7
  + (rule.endWeekday === rule.weekday && rule.endTime <= rule.startTime ? 7 : 0);

const assertRulesCoverSchedule = (rules, recurrenceMode) => {
  const weekMinutes = 7 * 1440;
  const cycleMinutes = recurrenceMode === "alternating" ? 2 * weekMinutes : weekMinutes;
  const intervals = [];
  for (let week = -2; week < 4; week += 1) {
    const parity = week % 2 === 0 ? "even" : "odd";
    for (const rule of rules) {
      if (rule.weekParity && rule.weekParity !== parity) continue;
      const start = week * weekMinutes + (rule.weekday - 1) * 1440
        + Number(rule.startTime.slice(0, 2)) * 60 + Number(rule.startTime.slice(3));
      const end = start + ruleEndOffset(rule) * 1440
        + Number(rule.endTime.slice(0, 2)) * 60 + Number(rule.endTime.slice(3))
        - Number(rule.startTime.slice(0, 2)) * 60 - Number(rule.startTime.slice(3));
      if (end > 0 && start < cycleMinutes) {
        intervals.push({ start: Math.max(0, start), end: Math.min(cycleMinutes, end), partyId: rule.partyId });
      }
    }
  }
  const boundaries = [...new Set([0, cycleMinutes, ...intervals.flatMap(({ start, end }) => [start, end])])]
    .sort((a, b) => a - b);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const assigned = new Set(intervals.filter((item) => item.start <= start && item.end >= end)
      .map((item) => item.partyId));
    assert(assigned.size > 0, `recurring rules must assign a party for every time in the schedule (${start}-${end})`);
    assert(assigned.size === 1,
      `recurring rules assign different parenting parties at the same time (${start}-${end})`);
  }
};

const validatePlan = (data, parties) => {
  assert(data && typeof data === "object" && !Array.isArray(data), "plan must be an object");
  assert(["weekly", "alternating"].includes(data.recurrenceMode), "recurrenceMode must be weekly or alternating");
  const effectiveFrom = validateDate(data.effectiveFrom, "effectiveFrom");
  const effectiveTo = data.effectiveTo == null || data.effectiveTo === "" ? null : validateDate(data.effectiveTo, "effectiveTo");
  assert(effectiveTo === null || effectiveTo >= effectiveFrom, "effectiveTo must be on or after effectiveFrom");
  const timeZone = data.timeZone ?? "UTC";
  assert(typeof timeZone === "string" && validTimeZone(timeZone), "timeZone must be a valid IANA time zone");
  assert(Array.isArray(data.rules) && data.rules.length <= 100, "rules must be an array with at most 100 entries");
  const rules = data.rules.map((rule, index) => validateRule(rule, index, parties, data.recurrenceMode));
  assert(new Set(rules.map((rule) => rule.id)).size === rules.length, "rule IDs must be unique");
  assert(new Set(rules.map((rule) => rule.partyId)).size >= 2,
    "recurring rules must assign time to at least two parenting parties");
  assertRulesCoverSchedule(rules, data.recurrenceMode);
  assert(data.active === undefined || typeof data.active === "boolean", "active must be a boolean");
  return { effectiveFrom, effectiveTo, timeZone, recurrenceMode: data.recurrenceMode, rules, active: data.active ?? true };
};

const validateChange = (data, parties, changes = [], ignoredId = null) => {
  const id = data.id == null ? randomUUID() : validateId(data.id, "id");
  const partyId = validateId(data.partyId, "partyId");
  assert(parties.some((party) => party.id === partyId), "partyId is not a parenting party in this household");
  const startAt = validateDateTime(data.startAt, "startAt");
  const endAt = validateDateTime(data.endAt, "endAt");
  assert(endAt > startAt, "endAt must be after startAt");
  assert(typeof data.label === "string" && data.label.trim().length > 0, "change label is required");
  assert(data.label.trim().length <= 200, "change label must be 200 characters or fewer");
  for (const change of changes) {
    if (change.id === ignoredId || change.id === id) continue;
    assert(endAt <= Date.parse(change.startAt) || startAt >= Date.parse(change.endAt),
      "one-off parenting-time changes must not overlap");
  }
  return { id, partyId, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), label: data.label.trim() };
};

const formatterCache = new Map();
const dateTimeFormatter = (timeZone) => {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }));
  }
  return formatterCache.get(timeZone);
};

const zonedParts = (timestamp, timeZone) => Object.fromEntries(
  dateTimeFormatter(timeZone).formatToParts(timestamp).map(({ type, value }) => [type, value])
);

const localDate = (timestamp, timeZone) => {
  const parts = zonedParts(timestamp, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const localDateTimeToTimestamp = (date, time, timeZone) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(candidate, timeZone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute));
    const next = target - (represented - candidate);
    if (next === candidate) break;
    candidate = next;
  }
  const matches = (timestamp) => {
    const parts = zonedParts(timestamp, timeZone);
    return parts.year === String(year).padStart(4, "0")
      && parts.month === String(month).padStart(2, "0")
      && parts.day === String(day).padStart(2, "0")
      && parts.hour === String(hour).padStart(2, "0")
      && parts.minute === String(minute).padStart(2, "0");
  };
  const matchingCandidates = [];
  for (let offset = -180; offset <= 180; offset += 1) {
    if (matches(candidate + offset * 60000)) matchingCandidates.push(candidate + offset * 60000);
  }
  if (matchingCandidates.length) return Math.min(...matchingCandidates);
  const error = new Error(`recurring handover ${date} ${time} does not exist in ${timeZone}`);
  error.status = 400;
  throw error;
};

const shiftDate = (date, days) => {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

const getPlanStartTimestamp = (plan) => localDateTimeToTimestamp(plan.effectiveFrom, "00:00", plan.timeZone);
const getPlanEndTimestamp = (plan) => plan.effectiveTo
  ? localDateTimeToTimestamp(shiftDate(plan.effectiveTo, 1), "00:00", plan.timeZone) : null;

const rangeTimestamp = (value, name) => validateDateTime(value, name);

const resolveParentingTime = ({ plan, parties, changes }, startAt, endAt) => {
  assert(plan && plan.active, "household has no active parenting-time plan");
  const start = rangeTimestamp(startAt, "startAt");
  const end = rangeTimestamp(endAt, "endAt");
  assert(end > start && end - start <= 366 * DAY_MS, "date-time range must be ordered and at most 366 days");
  const effectiveStart = getPlanStartTimestamp(plan);
  const effectiveEnd = getPlanEndTimestamp(plan);
  const resolutionStart = Math.max(start, effectiveStart);
  const resolutionEnd = effectiveEnd === null ? end : Math.min(end, effectiveEnd);
  if (resolutionEnd <= resolutionStart) return [];
  const startDate = shiftDate(localDate(resolutionStart, plan.timeZone), -8);
  const endDate = shiftDate(localDate(resolutionEnd, plan.timeZone), 1);
  const intervals = [];
  const addInterval = (interval) => {
    if (interval.end > resolutionStart && interval.start < resolutionEnd) intervals.push(interval);
  };
  for (const change of changes) {
    addInterval({ start: Date.parse(change.startAt), end: Date.parse(change.endAt), partyId: change.partyId,
      source: { type: "change", planId: plan.id, changeId: change.id, label: change.label } });
  }
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    const weekday = isoWeekday(date);
    const weekParity = isoWeekNumber(date) % 2 ? "odd" : "even";
    for (const rule of plan.rules) {
      if (rule.weekday !== weekday || (rule.weekParity && rule.weekParity !== weekParity)) continue;
      const offset = ruleEndOffset(rule);
      const ruleStart = localDateTimeToTimestamp(date, rule.startTime, plan.timeZone);
      const ruleEnd = localDateTimeToTimestamp(shiftDate(date, offset), rule.endTime, plan.timeZone);
      addInterval({ start: ruleStart, end: ruleEnd, partyId: rule.partyId,
        source: { type: "recurring", ruleId: rule.id } });
    }
  }
  const boundaries = [...new Set([resolutionStart, resolutionEnd,
    ...intervals.flatMap((item) => [Math.max(resolutionStart, item.start), Math.min(resolutionEnd, item.end)])])]
    .sort((a, b) => a - b);
  const result = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    if (segmentEnd <= segmentStart) continue;
    const activeChanges = intervals.filter((item) => item.source.type === "change"
      && item.start <= segmentStart && item.end >= segmentEnd);
    assert(activeChanges.length <= 1, "one-off parenting-time changes overlap in the requested range");
    const active = activeChanges.length ? activeChanges : intervals.filter((item) =>
      item.source.type === "recurring" && item.start <= segmentStart && item.end >= segmentEnd);
    const partiesInSegment = new Set(active.map((item) => item.partyId));
    assert(partiesInSegment.size <= 1, "active parenting-time plan is ambiguous for the requested range");
    assert(active.length > 0, "recurring plan leaves a gap in the requested range");
    const partyId = active[0].partyId;
    const sources = active.map((item) => item.source);
    const previous = result[result.length - 1];
    if (previous && previous.endAt === new Date(segmentStart).toISOString()
      && previous.partyId === partyId
      && ((previous.source.type === "plan" && sources[0]?.type !== "change")
        || (previous.source.type === "change" && sources[0]?.type === "change"
          && previous._sourceKey === JSON.stringify(sources)))) {
      previous.endAt = new Date(segmentEnd).toISOString();
      if (previous.source.type === "plan") {
        previous.source.parts.push({
          startAt: new Date(segmentStart).toISOString(),
          endAt: new Date(segmentEnd).toISOString(),
          sources,
        });
      }
    } else {
      const source = sources.length === 1 && sources[0].type === "change"
        ? sources[0]
        : { type: "plan", planId: plan.id, parts: [{
          startAt: new Date(segmentStart).toISOString(), endAt: new Date(segmentEnd).toISOString(), sources,
        }] };
      result.push({ startAt: new Date(segmentStart).toISOString(), endAt: new Date(segmentEnd).toISOString(),
        partyId, partyName: parties.find((party) => party.id === partyId)?.name ?? null,
        source, _sourceKey: source.type === "change" ? JSON.stringify(sources) : null });
    }
  }
  return result.map(({ _sourceKey, ...interval }) => interval);
};

const validateParentingRange = (startAt, endAt) => {
  const start = validateDateTime(startAt, "startAt");
  const end = validateDateTime(endAt, "endAt");
  assert(end > start && end - start <= 366 * DAY_MS, "date-time range must be ordered and at most 366 days");
  return { start, end };
};

// Validate requests outside the persisted-data boundary: only bad stored schedules become unknowns.
const resolvePersistedParentingTime = (data, startAt, endAt, { allowPartial = false } = {}) => {
  const { start, end } = validateParentingRange(startAt, endAt);
  const parties = Array.isArray(data?.parties) ? data.parties : [];
  const unknown = (reason, message) => ({
    status: "cannot_determine", reason, message, intervals: [], parties, timeZone: null,
  });
  if (!data?.plan || data.plan.active === false) {
    return unknown("no_active_plan", "Household has no active parenting-time plan.");
  }
  try {
    assert(data.plan.active === true, "persisted plan must be active");
    assert(parties.every((party) => party && typeof party === "object"), "persisted parties must be objects");
    const activeParties = parties.filter((party) => party.active !== false);
    const planId = validateId(data.plan.id, "plan.id");
    const plan = { ...validatePlan(data.plan, activeParties), id: planId };
    for (const rule of data.plan.rules) validateId(rule.id, "rule.id");
    assert(data.plan.handovers == null || Array.isArray(data.plan.handovers), "persisted handovers must be an array");
    if (data.plan.handovers?.length) {
      compileHandovers(validateHandovers(data.plan.handovers, activeParties));
    }
    assert(Array.isArray(data.changes), "persisted changes must be an array");
    const changes = [];
    for (const change of data.changes) {
      validateId(change?.id, "change.id");
      assert(change.planId == null || change.planId === planId, "change references a different plan");
      changes.push(validateChange(change, activeParties, changes));
    }
    assert(new Set(changes.map((change) => change.id)).size === changes.length, "change IDs must be unique");
    const effectiveStart = getPlanStartTimestamp(plan);
    const effectiveEnd = getPlanEndTimestamp(plan);
    assert(changes.every((change) => Date.parse(change.startAt) >= effectiveStart
      && (effectiveEnd === null || Date.parse(change.endAt) <= effectiveEnd)),
    "persisted changes fall outside the effective plan");
    const outsideEffectivePlan = start < effectiveStart || (effectiveEnd !== null && end > effectiveEnd);
    const outsideResult = () => unknown("outside_effective_plan",
      "Requested range is not fully covered by the plan's effective dates.");
    if (outsideEffectivePlan && !allowPartial) return outsideResult();
    const resolutionStart = Math.max(start, effectiveStart);
    const resolutionEnd = Math.min(end, effectiveEnd ?? end);
    if (resolutionEnd <= resolutionStart) {
      return { ...outsideResult(), timeZone: plan.timeZone };
    }
    const intervals = resolveParentingTime({ plan, parties: activeParties, changes }, startAt, endAt);
    let coveredUntil = resolutionStart;
    for (const interval of intervals) {
      assert(Date.parse(interval.startAt) === coveredUntil, "resolved plan leaves a gap");
      coveredUntil = Date.parse(interval.endAt);
    }
    assert(coveredUntil === resolutionEnd, "resolved plan does not cover the effective requested range");
    if (outsideEffectivePlan) return { ...outsideResult(), intervals, timeZone: plan.timeZone };
    return { status: "determined", intervals, parties, timeZone: plan.timeZone };
  } catch (error) {
    if (error.status !== 400) throw error;
    return unknown("invalid_plan", `Cannot determine responsibility from the persisted plan: ${error.message}`);
  }
};

const checkParentingResponsibility = (data, partyId, startAt, endAt) => {
  const id = validateId(partyId, "partyId");
  validateParentingRange(startAt, endAt);
  const party = Array.isArray(data?.parties)
    ? data.parties.find((item) => item?.id === id && item.active !== false) : null;
  assert(party, "partyId must be an active parenting party in this household");
  const resolved = resolvePersistedParentingTime(data, startAt, endAt);
  const overlaps = resolved.intervals.filter((interval) => interval.partyId === id);
  return {
    ...resolved, partyId: id, partyName: party.name ?? null,
    startAt: new Date(Date.parse(startAt)).toISOString(),
    endAt: new Date(Date.parse(endAt)).toISOString(),
    responsible: resolved.status === "determined" ? overlaps.length > 0 : null,
    overlaps,
  };
};

module.exports = {
  assert, validateId, validateParty, validatePlan, validateHandovers, compileHandovers,
  validateChange, resolveParentingTime, isoWeekNumber,
  getPlanStartTimestamp, getPlanEndTimestamp,
  validateParentingRange, resolvePersistedParentingTime, checkParentingResponsibility,
};
