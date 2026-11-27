const db = require("../shared/db");
const { PUBLIC_HEADERS, getPublicToken, tokenDigest } = require("../shared/shareLinks");

module.exports = async function resolveShareLink(context, req) {
  const respond = (status, body, headers = {}) => {
    context.res = { status, headers: { ...PUBLIC_HEADERS, ...headers }, body };
  };
  const unavailable = () => respond(404, { error: "share link not found" });
  try {
    const request = req ?? context.req;
    if (request?.method?.toUpperCase() !== "POST") return respond(405, { error: "method not supported" });
    const token = getPublicToken(request.headers);
    const body = request.body;
    if (!token || Object.keys(request.query ?? {}).length ||
      (body !== undefined && body !== null && body !== "" &&
        (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length))) return unavailable();
    const result = await db.resolveShareLink(tokenDigest(token), Date.now());
    if (!result || Date.parse(result.expiresAt) <= Date.now()) return unavailable();
    return respond(200, result);
  } catch (error) {
    if (error.status === 429) return respond(429, { error: "Too many requests" }, { "Retry-After": "60" });
    // Bearers, digests, and provider errors must never enter application logs or responses.
    return unavailable();
  }
};
