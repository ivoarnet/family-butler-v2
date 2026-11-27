const { MAX_LINKS, resources, projectMetadata } = require("../../shareLinks");

module.exports = function createShareLinksProvider(request) {
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
      try { return resource.project(result, now); } catch { return null; }
    },
  };
};
