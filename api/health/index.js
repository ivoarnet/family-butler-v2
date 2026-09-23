const prisma = require("../shared/prisma");

const isTruthyFlag = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

module.exports = async function health(context, req) {
  const httpRequest = req ?? context.req;
  const checksEnabled = isTruthyFlag(httpRequest?.query?.checks);

  if (!checksEnabled) {
    context.res = {
      status: 200,
      body: {
        status: "ok"
      }
    };
    return;
  }

  const env = {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim()),
    sqlConnectionStringConfigured: Boolean(
      process.env.SQL_CONNECTION_STRING && process.env.SQL_CONNECTION_STRING.trim()
    ),
    databaseConnectionStringConfigured: Boolean(
      process.env.DATABASE_CONNECTION_STRING && process.env.DATABASE_CONNECTION_STRING.trim()
    ),
  };

  let database = {
    connected: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { connected: true };
  } catch (error) {
    database = {
      connected: false,
      error: "Database connectivity check failed",
    };
  }

  const ok = database.connected && env.databaseUrlConfigured;

  context.res = {
    status: ok ? 200 : 503,
    body: {
      status: ok ? "ok" : "degraded",
      checks: {
        env,
        database,
      },
    },
  };
};
