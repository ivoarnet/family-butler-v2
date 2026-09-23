const db = require("../shared/db");

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
        status: "ok",
      },
    };
    return;
  }

  const env = {
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim()),
    supabaseSecretKeyConfigured: Boolean(process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SECRET_KEY.trim()),
  };

  let database;
  try {
    database = await db.checkConnection();
  } catch (_error) {
    database = {
      connected: false,
      error: "Supabase connectivity check failed",
    };
  }
  const ok = database.connected && env.supabaseUrlConfigured && env.supabaseSecretKeyConfigured;

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
