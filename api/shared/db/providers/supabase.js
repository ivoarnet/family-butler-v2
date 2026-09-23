const { createClient } = require("@supabase/supabase-js");

const TABLES = {
  households: "households",
  members: "household_members",
  contacts: "contacts",
  tasks: "tasks",
};

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const formatInList = (values) => `(${values.map((value) => JSON.stringify(value)).join(",")})`;

const mapHousehold = (row) => ({
  id: row.id,
  name: row.name,
  holidayRegion: row.holiday_region,
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

module.exports = function createSupabaseProvider() {
  const supabaseUrl = cleanString(process.env.SUPABASE_URL);
  const supabaseSecretKey = cleanString(process.env.SUPABASE_SECRET_KEY);
  const supabaseServiceRoleKey = cleanString(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseServerKey = supabaseSecretKey || supabaseServiceRoleKey;

  if (!supabaseUrl || !supabaseServerKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) must be configured");
  }

  const client = createClient(supabaseUrl, supabaseServerKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const throwIfError = (error) => {
    if (error) {
      throw new Error(error.message || "Supabase request failed");
    }
  };

  return {
    async ensureHousehold(householdId, householdName, holidayRegion) {
      const { error } = await client.from(TABLES.households).upsert(
        {
          id: householdId,
          name: householdName,
          holiday_region: holidayRegion,
        },
        { onConflict: "id" }
      );
      throwIfError(error);
    },

    async getHouseholdWithRelations(householdId) {
      const [householdResult, membersResult, contactsResult] = await Promise.all([
        client
          .from(TABLES.households)
          .select("id,name,holiday_region")
          .eq("id", householdId)
          .maybeSingle(),
        client
          .from(TABLES.members)
          .select("id,household_id,first_name,role,avatar_color,visible_in_calendar,sort_order")
          .eq("household_id", householdId)
          .order("sort_order", { ascending: true }),
        client
          .from(TABLES.contacts)
          .select("id,household_id,first_name,last_name,birth_day,birth_month,birth_year,email,mobile_phone")
          .eq("household_id", householdId),
      ]);

      throwIfError(householdResult.error);
      throwIfError(membersResult.error);
      throwIfError(contactsResult.error);

      if (!householdResult.data) {
        return null;
      }

      return {
        household: mapHousehold(householdResult.data),
        members: Array.isArray(membersResult.data) ? membersResult.data.map(mapMember) : [],
        contacts: Array.isArray(contactsResult.data) ? contactsResult.data.map(mapContact) : [],
      };
    },

    async replaceMembers(householdId, members) {
      const memberIds = members.map((member) => member.id);

      if (memberIds.length > 0) {
        const { error } = await client
          .from(TABLES.members)
          .delete()
          .eq("household_id", householdId)
          .not("id", "in", formatInList(memberIds));
        throwIfError(error);
      } else {
        const { error } = await client.from(TABLES.members).delete().eq("household_id", householdId);
        throwIfError(error);
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

      const { error } = await client.from(TABLES.members).upsert(payload, { onConflict: "id" });
      throwIfError(error);
    },

    async replaceContacts(householdId, contacts) {
      const contactIds = contacts.map((contact) => contact.id);

      if (contactIds.length > 0) {
        const { error } = await client
          .from(TABLES.contacts)
          .delete()
          .eq("household_id", householdId)
          .not("id", "in", formatInList(contactIds));
        throwIfError(error);
      } else {
        const { error } = await client.from(TABLES.contacts).delete().eq("household_id", householdId);
        throwIfError(error);
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

      const { error } = await client.from(TABLES.contacts).upsert(payload, { onConflict: "id" });
      throwIfError(error);
    },

    async listTasks() {
      const { data, error } = await client
        .from(TABLES.tasks)
        .select("id,title,created_at")
        .order("created_at", { ascending: false });
      throwIfError(error);
      return Array.isArray(data) ? data.map(mapTask) : [];
    },

    async createTask(title) {
      const { data, error } = await client
        .from(TABLES.tasks)
        .insert({ title })
        .select("id,title,created_at")
        .single();
      throwIfError(error);
      return mapTask(data);
    },

    async checkConnection() {
      const { error } = await client.from(TABLES.households).select("id", { head: true, count: "exact" }).limit(1);
      if (error) {
        return {
          connected: false,
          error: "Supabase connectivity check failed",
        };
      }

      return { connected: true };
    },
  };
};
