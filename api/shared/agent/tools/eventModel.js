const EVENT_MODEL_DESCRIPTION = [
  "Event table schema:",
  "- id: string (UUID)",
  "- title: string (required)",
  "- date: string (YYYY-MM-DD)",
  "- memberIds: string[] (at least one member id)",
  "- allDay: boolean",
  "- startTime: string | null (HH:MM, required for non all-day events)",
  "- endTime: string | null (HH:MM, required for non all-day events)",
  "- eventTypeId: string | null (should reference one available event type when possible)",
  "- repeatRule: string | null",
  "- location: string | null",
  "- notes: string | null",
].join("\n");

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeTime24Hour = (value) => {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return null;
  }
  const match = cleaned.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
};

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isFiveMinuteStepTime = (value) => {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return false;
  }
  return Number.parseInt(match[2], 10) % 5 === 0;
};

const toEventTypesContext = (eventTypes) => {
  const normalizedEventTypes = Array.isArray(eventTypes) ? eventTypes : [];
  if (normalizedEventTypes.length === 0) {
    return "Available event types: none configured for this household.";
  }

  const lines = normalizedEventTypes
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((eventType) => {
      const id = cleanString(eventType?.id);
      const name = cleanString(eventType?.name);
      const icon = cleanString(eventType?.icon);
      const color = cleanString(eventType?.color);
      return `- ${name || "(unnamed)"} | id=${id || "n/a"}${icon ? ` | icon=${icon}` : ""}${color ? ` | color=${color}` : ""}`;
    });

  return ["Available event types:", ...lines].join("\n");
};

const toAvailableMembers = (members) =>
  (Array.isArray(members) ? members : [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((member) => ({
      id: member.id,
      firstName: member.firstName,
      role: member.role ?? null,
    }));

const toEventMembersContext = (members) => {
  const availableMembers = toAvailableMembers(members);
  if (availableMembers.length === 0) {
    return "Available household members: none configured for this household.";
  }

  const lines = availableMembers.map((member) => `- ${cleanString(member.firstName) || "(unnamed)"} | id=${cleanString(member.id) || "n/a"}`);
  return [
    "Available household members (use these ids in memberIds):",
    ...lines,
    "Important: memberIds must reference household members only, never contact ids.",
  ].join("\n");
};

const toEventOutput = (event) => ({
  id: event.id,
  title: event.title,
  date: event.date,
  memberIds: Array.isArray(event.memberIds) ? event.memberIds : [],
  allDay: event.allDay !== false,
  startTime: event.startTime ?? null,
  endTime: event.endTime ?? null,
  eventTypeId: event.eventTypeId ?? null,
  repeatRule: event.repeatRule ?? null,
  location: event.location ?? null,
  notes: event.notes ?? null,
});

module.exports = {
  EVENT_MODEL_DESCRIPTION,
  cleanString,
  normalizeTime24Hour,
  isIsoDate,
  isUuid,
  isFiveMinuteStepTime,
  toEventTypesContext,
  toAvailableMembers,
  toEventMembersContext,
  toEventOutput,
};
