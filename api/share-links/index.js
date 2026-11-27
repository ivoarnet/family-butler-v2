const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const { validateId } = require("../shared/validation");
const { PUBLIC_HEADERS, validateInput, createToken, tokenDigest } = require("../shared/shareLinks");

module.exports = async function shareLinks(context, req) {
  const respond = (status, body) => { context.res = { status, headers: PUBLIC_HEADERS, ...(body ? { body } : {}) }; };
  try {
    const request = req ?? context.req;
    const userId = await getAuthenticatedUserId(request?.headers);
    if (!userId) return respond(401, { error: "authentication required" });
    const householdId = validateId(request?.params?.householdId ?? context.bindingData?.householdId, "householdId");
    const ownerId = validateId(userId, "userId");
    const method = request.method?.toUpperCase();
    if (method === "GET") {
      return respond(200, await db.manageShareLinks(householdId, ownerId, "list", {}));
    }
    if (method === "POST") {
      const data = validateInput(request.body, true);
      const token = createToken();
      const result = await db.manageShareLinks(householdId, ownerId, "create", { ...data, digest: tokenDigest(token) });
      return respond(201, { link: result.link, token });
    }
    if (method === "PATCH" || method === "DELETE") {
      const id = validateId(request.query?.id, "id");
      const data = method === "PATCH" ? validateInput(request.body, false) : {};
      const result = await db.manageShareLinks(householdId, ownerId, method === "PATCH" ? "update" : "delete", { ...data, id });
      return method === "DELETE" ? respond(204) : respond(200, result);
    }
    return respond(405, { error: "method not supported" });
  } catch (error) {
    const status = [400, 404, 409].includes(error.status) ? error.status : 500;
    respond(status, { error: status === 400 ? error.message : status === 404 ? "share link not found" :
      status === 409 ? "share link limit reached" : "Internal server error" });
  }
};
