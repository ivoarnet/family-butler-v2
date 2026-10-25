const assert = require("node:assert/strict");
const test = require("node:test");

const createSupabaseProvider = require("./shared/db/providers/supabase");

test("agent execution budget uses atomic Supabase reservation and release RPCs", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  const requests = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => (String(url).endsWith("/reserve_agent_execution") ? "true" : "null"),
    };
  };

  try {
    const db = createSupabaseProvider();
    const reservation = {
      executionId: "execution-id",
      userId: "user-id",
      householdId: "household-id",
      userDailyLimit: 40,
      householdDailyLimit: 100,
      userConcurrencyLimit: 2,
      householdConcurrencyLimit: 3,
      reservationTimeoutSeconds: 120,
    };
    assert.equal(await db.reserveAgentExecution(reservation), true);
    await db.finishAgentExecution(reservation.executionId);

    assert.match(requests[0].url, /\/rpc\/reserve_agent_execution$/);
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      p_user_id: "user-id",
      p_household_id: "household-id",
      p_execution_id: "execution-id",
      p_user_daily_limit: 40,
      p_household_daily_limit: 100,
      p_user_concurrency_limit: 2,
      p_household_concurrency_limit: 3,
      p_reservation_timeout_seconds: 120,
    });
    assert.match(requests[1].url, /\/rpc\/finish_agent_execution$/);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});
