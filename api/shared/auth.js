const db = require("./db");

const APP_ROLES = {
  admin: "admin",
  demouser: "demouser",
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getBearerToken = (request) => {
  const authorizationHeader = request?.headers?.authorization ?? request?.headers?.Authorization;
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
};

const getRoleFromUser = (user) => {
  const role = typeof user?.app_metadata?.role === "string" ? user.app_metadata.role.trim().toLowerCase() : "";
  if (role === APP_ROLES.demouser) {
    return APP_ROLES.demouser;
  }
  return APP_ROLES.admin;
};

const authenticateRequest = async (request) => {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw createHttpError(401, "Missing bearer token");
  }

  let user;
  try {
    user = await db.getAuthUser(accessToken);
  } catch (_error) {
    throw createHttpError(401, "Invalid or expired token");
  }

  if (!user?.id) {
    throw createHttpError(401, "Invalid auth user");
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role: getRoleFromUser(user),
  };
};

module.exports = {
  APP_ROLES,
  createHttpError,
  authenticateRequest,
};
