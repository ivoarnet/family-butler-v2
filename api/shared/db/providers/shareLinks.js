const { MAX_LINKS, MAX_CHANGES, CHILDCARE_RESOURCE, resources, projectMetadata,
  localDateInTimeZone } = require("../../shareLinks");
const { resolveOccurrences } = require("../../childcare");
const createChildcareProvider = require("./childcare");

module.exports = function createShareLinksProvider(request) {
  const childcare = createChildcareProvider(request);
  return {
    async manageShareLinks(householdId, userId, action, data) {
      const result = await request("rpc/manage_share_links", {
        method: "POST",
        body: { p_household: householdId, p_user: userId, p_action: action, p_data: data },
      });
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("unavailable");
      if (result.error) throw Object.assign(new Error("invalid share-link request"), {
        status: [400, 404, 409].includes(result.status) ? result.status : 500,
      });
      try {
        if (action === "list") {
          if (!Array.isArray(result.links) || result.links.length > MAX_LINKS) throw new Error("unavailable");
          return { links: result.links.map(projectMetadata) };
        }
        if (action === "delete") {
          if (result.ok !== true) throw new Error("unavailable");
          return { ok: true };
        }
        return { link: projectMetadata(result.link) };
      } catch {
        throw new Error("unavailable");
      }
    },
    async resolveShareLink(digest, now, viewId) {
      const result = await request("rpc/resolve_share_link", {
        method: "POST", body: {
          p_digest: digest, p_now: new Date(now).toISOString(),
          ...(viewId === undefined ? {} : { p_view_id: viewId }),
        },
      });
      if (!result || typeof result !== "object" || Array.isArray(result)) return null;
      if (result.error) {
        if (result.status === 429) throw Object.assign(new Error("rate limited"), { status: 429 });
        return null;
      }
      if (Date.parse(result.expiresAt) <= Math.max(now, Date.now())) return null;
      const resource = resources.get(result.resourceType);
      if (!resource) return null;
      try {
        const projected = resource.project(result, now);
        if (result.resourceType !== CHILDCARE_RESOURCE) return projected;
        const expiresAt = new Date(Date.parse(projected.expiresAt)).toISOString();
        const endDate = projected.filters.endDate;
        const [data, members] = await Promise.all([
          childcare.getChildcare(projected.householdId),
          request("household_members", {
            params: { select: "id,first_name", household_id: `eq.${projected.householdId}`, limit: 500 },
          }),
        ]);
        const providerNames = new Map(data.providers.map((provider) => [provider.id, provider.name]));
        const memberNames = new Map(members.map((member) => [member.id, member.first_name]));
        const startDate = projected.filters.startDate;
        const occurrences = resolveOccurrences(data, startDate, endDate).filter((occurrence) =>
          occurrence.date >= localDateInTimeZone(now, projected.filters.timeZone)
          && (!projected.filters.providerId || occurrence.providerId === projected.filters.providerId));
        if (occurrences.length > MAX_CHANGES) return null;
        return {
          resourceType: CHILDCARE_RESOURCE, expiresAt,
          timeZone: projected.filters.timeZone, startDate, endDate,
          providerName: projected.filters.providerId
            ? providerNames.get(projected.filters.providerId) ?? "Care provider" : null,
          occurrences: occurrences.map((occurrence) => ({
            date: occurrence.date,
            providerName: providerNames.get(occurrence.providerId) ?? "Care provider",
            childNames: occurrence.childIds.map((id) => memberNames.get(id) ?? "Family member"),
            allDay: occurrence.allDay, startTime: occurrence.startTime, endTime: occurrence.endTime,
            overrideAction: occurrence.overrideAction,
          })),
        };
      } catch {
        return null;
      }
    },
  };
};
