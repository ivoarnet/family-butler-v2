const { randomUUID } = require("crypto");

const TABLES = {
  households: "households",
  members: "household_members",
  contacts: "contacts",
  eventTypes: "event_types",
  events: "events",
  dayConfigurations: "day_configurations",
  tasks: "tasks",
};

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

const mapTask = (row) => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
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

  const request = async (table, { method = "GET", params, body, headers } = {}) => {
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

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  };

  return {
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

    async getHouseholdWithRelations(householdId, userId) {
      const [households, members, contacts, eventTypes, events, dayConfigurations] = await Promise.all([
        request(TABLES.households, {
          params: {
            select: "id,name,holiday_region",
            id: `eq.${householdId}`,
            created_by_user_id: `eq.${userId}`,
          },
        }),
        request(TABLES.members, {
          params: {
            select: "id,household_id,first_name,role,avatar_color,visible_in_calendar,sort_order",
            household_id: `eq.${householdId}`,
            order: "sort_order.asc",
          },
        }),
        request(TABLES.contacts, {
          params: {
            select: "id,household_id,first_name,last_name,birth_day,birth_month,birth_year,email,mobile_phone",
            household_id: `eq.${householdId}`,
          },
        }),
        request(TABLES.eventTypes, {
          params: {
            select: "id,household_id,name,icon,color,sort_order",
            household_id: `eq.${householdId}`,
            order: "sort_order.asc",
          },
        }),
        request(TABLES.events, {
          params: {
            select: "id,household_id,title,event_date,member_ids,all_day,start_time,end_time,event_type_id,repeat_rule,location,notes",
            household_id: `eq.${householdId}`,
            order: "event_date.asc",
          },
        }),
        request(TABLES.dayConfigurations, {
          params: {
            select: "id,household_id,category,start_date,end_date,label",
            household_id: `eq.${householdId}`,
            order: "start_date.asc",
          },
        }),
      ]);

      const household = Array.isArray(households) ? households[0] : null;
      if (!household) {
        return null;
      }

      return {
        household: mapHousehold(household),
        members: Array.isArray(members) ? members.map(mapMember) : [],
        contacts: Array.isArray(contacts) ? contacts.map(mapContact) : [],
        eventTypes: Array.isArray(eventTypes) ? eventTypes.map(mapEventType) : [],
        events: Array.isArray(events) ? events.map(mapEvent) : [],
        dayConfigurations: Array.isArray(dayConfigurations) ? dayConfigurations.map(mapDayConfiguration) : [],
      };
    },

    async replaceMembers(householdId, members) {
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
      const eventIds = events.map((event) => event.id);

      if (eventIds.length > 0) {
        await request(TABLES.events, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
            id: `not.in.${formatInList(eventIds)}`,
          },
        });
      } else {
        await request(TABLES.events, {
          method: "DELETE",
          params: {
            household_id: `eq.${householdId}`,
          },
        });
      }

      if (eventIds.length === 0) {
        return;
      }

      const payload = events.map((event) => ({
        id: event.id,
        household_id: householdId,
        title: event.title,
        event_date: event.date,
        member_ids: event.memberIds,
        all_day: event.allDay,
        start_time: event.startTime,
        end_time: event.endTime,
        event_type_id: event.eventTypeId,
        repeat_rule: event.repeatRule,
        location: event.location,
        notes: event.notes,
      }));

      await request(TABLES.events, {
        method: "POST",
        params: { on_conflict: "id" },
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: payload,
      });
    },

    async replaceDayConfigurations(householdId, dayConfigurations) {
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

    async listTasks() {
      const data = await request(TABLES.tasks, {
        params: {
          select: "id,title,created_at",
          order: "created_at.desc",
        },
      });
      return Array.isArray(data) ? data.map(mapTask) : [];
    },

    async createTask(title) {
      const data = await request(TABLES.tasks, {
        method: "POST",
        params: {
          select: "id,title,created_at",
        },
        headers: {
          Prefer: "return=representation",
        },
        body: { title },
      });

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        throw new Error("Failed to create task");
      }

      return mapTask(row);
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
