const { randomUUID } = require("crypto");
const createChildcareProvider = require("./childcare");
const createParentingTimeProvider = require("./parentingTime");
const createGroceriesProvider = require("./groceries");

const TABLES = {
  households: "households",
  members: "household_members",
  contacts: "contacts",
  eventTypes: "event_types",
  events: "events",
  dayConfigurations: "day_configurations",
};

const CORE_PAGE_SIZE = 500;
const COMPLETE_COLLECTIONS = new WeakMap();

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const formatInList = (values) => `(${values.join(",")})`;

const mapHousehold = (row) => ({
  id: row.id,
  name: row.name,
  holidayRegion: row.holiday_region,
});

const mapHouseholdSummary = (row) => ({
  id: row.id,
  name: row.name,
});

const mapMember = (row) => ({
  id: row.id,
  householdId: row.household_id,
  firstName: row.first_name,
  role: row.role,
  isChild: row.is_child === true,
  hatchParentingAway: row.hatch_parenting_away === true,
  schoolBuilding: row.school_building ?? null,
  schoolClass: row.school_class ?? null,
  avatarColor: row.avatar_color,
  visibleInCalendar: row.visible_in_calendar,
  sortOrder: row.sort_order,
});

const mapContact = (row) => ({
  id: row.id,
  householdId: row.household_id,
  firstName: row.first_name,
  lastName: row.last_name,
  birthDay: row.birth_day,
  birthMonth: row.birth_month,
  birthYear: row.birth_year,
  email: row.email,
  mobilePhone: row.mobile_phone,
});

const mapEventType = (row) => ({
  id: row.id,
  householdId: row.household_id,
  name: row.name,
  icon: row.icon,
  color: row.color,
  sortOrder: row.sort_order,
});

const mapEvent = (row) => ({
  id: row.id,
  householdId: row.household_id,
  title: row.title,
  date: row.event_date,
  endDate: row.end_date,
  memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
  allDay: row.all_day,
  startTime: row.start_time,
  endTime: row.end_time,
  eventTypeId: row.event_type_id,
  repeatRule: row.repeat_rule,
  location: row.location,
  notes: row.notes,
});

const mapDayConfiguration = (row) => ({
  id: row.id,
  householdId: row.household_id,
  category: row.category,
  startDate: row.start_date,
  endDate: row.end_date,
  label: row.label,
});

const parseErrorMessage = async (response) => {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object") {
      if (typeof payload.message === "string" && payload.message) {
        return payload.message;
      }
      if (typeof payload.error === "string" && payload.error) {
        return payload.error;
      }
    }
  } catch (_error) {
    // ignore json parse failures
  }

  try {
    const text = await response.text();
    if (text) {
      return text;
    }
  } catch (_error) {
    // ignore text parse failures
  }

  return `Supabase request failed with status ${response.status}`;
};

module.exports = function createSupabaseProvider() {
  const supabaseUrl = cleanString(process.env.SUPABASE_URL);
  const supabaseSecretKey = cleanString(process.env.SUPABASE_SECRET_KEY);

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured");
  }

  const restBaseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
  const authorizationHeader = ["Bearer", supabaseSecretKey].join(" ");

  const request = async (table, { method = "GET", params, body, headers, includeMetadata = false } = {}) => {
    const url = new URL(`${restBaseUrl}/${table}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const response = await fetch(url, {
      method,
      headers: {
        apikey: supabaseSecretKey,
        Authorization: authorizationHeader,
        "Content-Type": "application/json",
        ...(headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    if (response.status === 204) return includeMetadata
      ? { data: null, contentRange: response.headers.get("content-range") }
      : null;

    const text = await response.text();
    if (!text) return includeMetadata
      ? { data: null, contentRange: response.headers.get("content-range") }
      : null;

    let data;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = null;
    }
    return includeMetadata
      ? { data, contentRange: response.headers.get("content-range") }
      : data;
  };

  const readRevision = async (householdId) => {
    const rows = await request("household_revisions", {
      params: { select: "revision", household_id: `eq.${householdId}`, limit: 1 },
    });
    const revision = Number(Array.isArray(rows) ? rows[0]?.revision ?? 0 : NaN);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error("Household revision read was incomplete");
    }
    return revision;
  };

  const readCompleteCollection = async (table, householdId, select, order, filters = {}) => {
    const rows = [];
    let expectedCount = null;
    for (let offset = 0; ; ) {
      const page = await request(table, {
        params: {
          select,
          household_id: `eq.${householdId}`,
          ...filters,
          order,
          limit: CORE_PAGE_SIZE,
          offset,
        },
        headers: { Prefer: "count=exact" },
        includeMetadata: true,
      });
      if (!Array.isArray(page.data)) {
        throw new Error(`Core ${table} read was incomplete`);
      }

      const range = typeof page.contentRange === "string"
        ? page.contentRange.match(/^(?:(\d+)-(\d+)|\*)\/(\d+)$/)
        : null;
      if (!range) throw new Error(`Core ${table} read completeness could not be verified`);
      const total = Number(range[3]);
      if (!Number.isSafeInteger(total)) throw new Error(`Core ${table} read completeness could not be verified`);
      if (expectedCount !== null && total !== expectedCount) {
        throw new Error(`Core ${table} changed during read`);
      }
      expectedCount = total;

      if (range[1] === undefined) {
        if (total === 0 && offset === 0 && page.data.length === 0) return rows;
        throw new Error(`Core ${table} read returned an incomplete page`);
      }

      const first = Number(range[1]);
      const last = Number(range[2]);
      if (first !== offset || last - first + 1 !== page.data.length || page.data.length === 0
        || page.data.length > total - offset) {
        throw new Error(`Core ${table} read returned an incomplete page`);
      }

      rows.push(...page.data);
      offset += page.data.length;
      if (offset === total) return rows;
      if (offset > total) throw new Error(`Core ${table} read returned an incomplete page`);
    }
  };

  const registerCompleteCollection = (householdId, revision, collection) => {
    COMPLETE_COLLECTIONS.set(collection, {
      householdId,
      revision,
      ids: collection.map((entity) => entity.id).sort(),
    });
    return collection;
  };

  const assertCompleteCollection = async (householdId, name, collection) => {
    const snapshot = COMPLETE_COLLECTIONS.get(collection);
    const currentIds = Array.isArray(collection) ? collection.map((entity) => entity.id).sort() : [];
    if (!snapshot || snapshot.householdId !== householdId
      || snapshot.ids.length !== currentIds.length
      || snapshot.ids.some((id, index) => id !== currentIds[index])) {
      throw new Error(`Cannot replace ${name} from an incomplete household snapshot`);
    }
    if (await readRevision(householdId) !== snapshot.revision) {
      throw new Error(`Cannot replace ${name} from a stale household snapshot`);
    }
  };

  return {
    ...createChildcareProvider(request),
    ...createParentingTimeProvider(request),
    ...createGroceriesProvider(request),
    async reserveAgentExecution({
      executionId,
      userId,
      householdId,
      userDailyLimit,
      householdDailyLimit,
      userConcurrencyLimit,
      householdConcurrencyLimit,
      reservationTimeoutSeconds,
    }) {
      return (await request("rpc/reserve_agent_execution", {
        method: "POST",
        body: {
          p_user_id: userId,
          p_household_id: householdId,
          p_execution_id: executionId,
          p_user_daily_limit: userDailyLimit,
          p_household_daily_limit: householdDailyLimit,
          p_user_concurrency_limit: userConcurrencyLimit,
          p_household_concurrency_limit: householdConcurrencyLimit,
          p_reservation_timeout_seconds: reservationTimeoutSeconds,
        },
      })) === true;
    },
    async finishAgentExecution(executionId) {
      await request("rpc/finish_agent_execution", {
        method: "POST",
        body: { p_execution_id: executionId },
      });
    },
    async listHouseholds(userId) {
      const households = await request(TABLES.households, {
        params: {
          select: "id,name",
          created_by_user_id: `eq.${userId}`,
          order: "created_at.asc",
        },
      });
      return Array.isArray(households) ? households.map(mapHouseholdSummary) : [];
    },

    async createHousehold(householdName, holidayRegion, userId) {
      const householdId = randomUUID();
      const data = await request(TABLES.households, {
        method: "POST",
        params: {
          select: "id,name,holiday_region,created_by_user_id",
        },
        headers: {
          Prefer: "return=representation",
        },
        body: {
          id: householdId,
          name: householdName,
          holiday_region: holidayRegion,
          created_by_user_id: userId,
        },
      });

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        throw new Error("Failed to create household");
      }

      return mapHousehold(row);
    },

    async getMemberHouseholdId(memberId) {
      const rows = await request(TABLES.members, {
        params: {
          select: "household_id",
          id: `eq.${memberId}`,
          limit: 1,
        },
      });

      const row = Array.isArray(rows) ? rows[0] : null;
      return row && typeof row.household_id === "string" ? row.household_id : null;
    },

    async getContactHouseholdId(contactId) {
      const rows = await request(TABLES.contacts, {
        params: {
          select: "household_id",
          id: `eq.${contactId}`,
          limit: 1,
        },
      });

      const row = Array.isArray(rows) ? rows[0] : null;
      return row && typeof row.household_id === "string" ? row.household_id : null;
    },

    async getEventTypeHouseholdId(eventTypeId) {
      const rows = await request(TABLES.eventTypes, {
        params: {
          select: "household_id",
          id: `eq.${eventTypeId}`,
          limit: 1,
        },
      });

      const row = Array.isArray(rows) ? rows[0] : null;
      return row && typeof row.household_id === "string" ? row.household_id : null;
    },

    async getEventHouseholdId(eventId) {
      const rows = await request(TABLES.events, {
        params: {
          select: "household_id",
          id: `eq.${eventId}`,
          limit: 1,
        },
      });

      const row = Array.isArray(rows) ? rows[0] : null;
      return row && typeof row.household_id === "string" ? row.household_id : null;
    },

    async getDayConfigurationHouseholdId(dayConfigurationId) {
      const rows = await request(TABLES.dayConfigurations, {
        params: {
          select: "household_id",
          id: `eq.${dayConfigurationId}`,
          limit: 1,
        },
      });

      const row = Array.isArray(rows) ? rows[0] : null;
      return row && typeof row.household_id === "string" ? row.household_id : null;
    },

    async ensureHousehold(householdId, householdName, holidayRegion, userId) {
      await request(TABLES.households, {
        method: "POST",
        params: { on_conflict: "id" },
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: {
          id: householdId,
          name: householdName,
          holiday_region: holidayRegion,
          created_by_user_id: userId,
        },
      });
    },

    async getHouseholdWithRelations(householdId, userId, {
      startDate,
      endDate,
      mutationContext = false,
      includeMembers = true,
      includeEventTypes = true,
    } = {}) {
      const initialRevision = await readRevision(householdId);
      const households = await request(TABLES.households, {
        params: {
          select: "id,name,holiday_region",
          id: `eq.${householdId}`,
          created_by_user_id: `eq.${userId}`,
        },
      });
      const household = Array.isArray(households) ? households[0] : null;
      if (!household) {
        return null;
      }

      const eventFilters = startDate && endDate ? {
        or: `(and(event_date.gte.${startDate},event_date.lte.${endDate}),and(event_date.lte.${endDate},end_date.gte.${startDate}),repeat_rule.not.is.null)`,
      } : {};
      const [memberRows, contactRows, eventTypeRows, eventRows, dayConfigurationRows] = await Promise.all([
        !mutationContext || includeMembers ? readCompleteCollection(TABLES.members, householdId,
          "id,household_id,first_name,role,is_child,hatch_parenting_away,school_building,school_class,avatar_color,visible_in_calendar,sort_order",
          "sort_order.asc,id.asc") : [],
        mutationContext ? [] : readCompleteCollection(TABLES.contacts, householdId,
          "id,household_id,first_name,last_name,birth_day,birth_month,birth_year,email,mobile_phone", "id.asc"),
        !mutationContext || includeEventTypes ? readCompleteCollection(TABLES.eventTypes, householdId,
          "id,household_id,name,icon,color,sort_order", "sort_order.asc,id.asc") : [],
        mutationContext ? [] : readCompleteCollection(TABLES.events, householdId,
          "id,household_id,title,event_date,end_date,member_ids,all_day,start_time,end_time,event_type_id,repeat_rule,location,notes",
          "event_date.asc,id.asc", eventFilters),
        mutationContext ? [] : readCompleteCollection(TABLES.dayConfigurations, householdId,
          "id,household_id,category,start_date,end_date,label", "start_date.asc,id.asc"),
      ]);
      const revision = await readRevision(householdId);
      if (revision !== initialRevision) throw new Error("Household changed during read");

      const members = memberRows.map(mapMember);
      const contacts = contactRows.map(mapContact);
      const eventTypes = eventTypeRows.map(mapEventType);
      const events = eventRows.map(mapEvent);
      const dayConfigurations = dayConfigurationRows.map(mapDayConfiguration);
      if (!mutationContext || includeMembers) registerCompleteCollection(householdId, revision, members);
      if (!mutationContext) registerCompleteCollection(householdId, revision, contacts);
      if (!mutationContext || includeEventTypes) registerCompleteCollection(householdId, revision, eventTypes);
      if (!mutationContext && (!startDate || !endDate)) registerCompleteCollection(householdId, revision, events);
      if (!mutationContext) registerCompleteCollection(householdId, revision, dayConfigurations);

      return {
        household: mapHousehold(household),
        revision,
        completeness: {
          members: !mutationContext || includeMembers,
          contacts: !mutationContext,
          eventTypes: !mutationContext || includeEventTypes,
          events: !mutationContext && (!startDate || !endDate),
          dayConfigurations: !mutationContext,
        },
        members,
        contacts,
        eventTypes,
        events,
        dayConfigurations,
      };
    },

    async mutateHouseholdEntity(householdId, expectedRevision, entityType, operation, entityId, entity) {
      const revision = await request("rpc/mutate_household_entity", {
        method: "POST",
        body: {
          p_household_id: householdId,
          p_expected_revision: expectedRevision,
          p_entity_type: entityType,
          p_operation: operation,
          p_entity_id: entityId,
          p_entity: entity,
        },
      });
      const nextRevision = Number(Array.isArray(revision) ? revision[0] : revision);
      if (!Number.isSafeInteger(nextRevision) || nextRevision <= expectedRevision) {
        throw new Error("Core entity mutation did not return a valid revision");
      }
      return nextRevision;
    },

    async mutateHouseholdEntities(householdId, expectedRevision, mutations) {
      const revision = await request("rpc/mutate_household_entities", {
        method: "POST",
        body: {
          p_household_id: householdId,
          p_expected_revision: expectedRevision,
          p_mutations: mutations,
        },
      });
      const nextRevision = Number(Array.isArray(revision) ? revision[0] : revision);
      if (!Number.isSafeInteger(nextRevision) || nextRevision <= expectedRevision) {
        throw new Error("Core entity mutation batch did not return a valid revision");
      }
      return nextRevision;
    },

    async replaceMembers(householdId, members) {
      await assertCompleteCollection(householdId, "members", members);
      const memberIds = members.map((member) => member.id);

      if (memberIds.length > 0) {
        await request(TABLES.members, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
            id: `not.in.${formatInList(memberIds)}`,
          },
        });
      } else {
        await request(TABLES.members, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
          },
        });
      }

      if (memberIds.length === 0) {
        return;
      }

      const payload = members.map((member) => ({
        id: member.id,
        household_id: householdId,
        first_name: member.firstName,
        role: member.role,
        is_child: member.isChild,
        hatch_parenting_away: member.hatchParentingAway,
        school_building: member.schoolBuilding,
        school_class: member.schoolClass,
        avatar_color: member.avatarColor,
        visible_in_calendar: member.visibleInCalendar,
        sort_order: member.sortOrder,
      }));

      await request(TABLES.members, {
        method: "POST",
        params: { on_conflict: "id" },
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: payload,
      });
    },

    async replaceContacts(householdId, contacts) {
      await assertCompleteCollection(householdId, "contacts", contacts);
      const contactIds = contacts.map((contact) => contact.id);

      if (contactIds.length > 0) {
        await request(TABLES.contacts, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
            id: `not.in.${formatInList(contactIds)}`,
          },
        });
      } else {
        await request(TABLES.contacts, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
          },
        });
      }

      if (contactIds.length === 0) {
        return;
      }

      const payload = contacts.map((contact) => ({
        id: contact.id,
        household_id: householdId,
        first_name: contact.firstName,
        last_name: contact.lastName,
        birth_day: contact.birthDay,
        birth_month: contact.birthMonth,
        birth_year: contact.birthYear,
        email: contact.email,
        mobile_phone: contact.mobilePhone,
      }));

      await request(TABLES.contacts, {
        method: "POST",
        params: { on_conflict: "id" },
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: payload,
      });
    },

    async replaceEventTypes(householdId, eventTypes) {
      await assertCompleteCollection(householdId, "event types", eventTypes);
      const eventTypeIds = eventTypes.map((eventType) => eventType.id);

      if (eventTypeIds.length > 0) {
        await request(TABLES.eventTypes, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
            id: `not.in.${formatInList(eventTypeIds)}`,
          },
        });
      } else {
        await request(TABLES.eventTypes, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
          },
        });
      }

      if (eventTypeIds.length === 0) {
        return;
      }

      const payload = eventTypes.map((eventType) => ({
        id: eventType.id,
        household_id: householdId,
        name: eventType.name,
        icon: eventType.icon,
        color: eventType.color,
        sort_order: eventType.sortOrder,
      }));

      await request(TABLES.eventTypes, {
        method: "POST",
        params: { on_conflict: "id" },
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: payload,
      });
    },

    async replaceEvents(householdId, events) {
      await assertCompleteCollection(householdId, "events", events);
      const payload = events.map((event) => ({
        id: event.id,
        title: event.title,
        event_date: event.date,
        end_date: event.endDate ?? null,
        member_ids: event.memberIds,
        all_day: event.allDay,
        start_time: event.startTime,
        end_time: event.endTime,
        event_type_id: event.eventTypeId,
        repeat_rule: event.repeatRule,
        location: event.location,
        notes: event.notes,
      }));

      await request("rpc/replace_household_events", {
        method: "POST",
        body: { p_household_id: householdId, p_events: payload },
      });
    },

    async replaceDayConfigurations(householdId, dayConfigurations) {
      await assertCompleteCollection(householdId, "day configurations", dayConfigurations);
      const dayConfigurationIds = dayConfigurations.map((dayConfiguration) => dayConfiguration.id);

      if (dayConfigurationIds.length > 0) {
        await request(TABLES.dayConfigurations, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
            id: `not.in.${formatInList(dayConfigurationIds)}`,
          },
        });
      } else {
        await request(TABLES.dayConfigurations, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
          },
        });
      }

      if (dayConfigurationIds.length === 0) {
        return;
      }

      const payload = dayConfigurations.map((dayConfiguration) => ({
        id: dayConfiguration.id,
        household_id: householdId,
        category: dayConfiguration.category,
        start_date: dayConfiguration.startDate,
        end_date: dayConfiguration.endDate,
        label: dayConfiguration.label,
      }));

      await request(TABLES.dayConfigurations, {
        method: "POST",
        params: { on_conflict: "id" },
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: payload,
      });
    },

    async checkConnection() {
      try {
        await request(TABLES.households, {
          params: {
            select: "id",
            limit: 1,
          },
        });

        return { connected: true };
      } catch (_error) {
        return {
          connected: false,
          error: "Supabase connectivity check failed",
        };
      }
    },
  };
};
