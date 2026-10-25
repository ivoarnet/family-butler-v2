const assert = require("node:assert/strict");
const test = require("node:test");

process.env.AGENT_MAX_FILE_BYTES = "8";
process.env.AGENT_MAX_REQUEST_BYTES = "32";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
const agentChat = require("./agent-chat");

const authenticatedFetch = () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /\/auth\/v1\/user$/);
    return { ok: true, json: async () => ({ id: "user-id" }) };
  };
  return () => calls;
};

const invoke = async (body, headers = {}, rawBody) => {
  const context = {
    res: null,
    log: {
      error() {},
      warn() {},
    },
  };
  await agentChat(context, {
    headers: { authorization: ["Bearer", "test-token"].join(" "), ...headers },
    body,
    rawBody,
  });
  return context.res;
};

test("rejects oversized requests, messages, histories, and attachment claims before provider work", async () => {
  const previousFetch = global.fetch;
  const authCalls = authenticatedFetch();
  try {
    assert.equal((await invoke({}, { "content-length": "33" })).status, 413);
    assert.equal((await invoke({}, {}, "x".repeat(33))).status, 413);
    assert.equal(authCalls(), 0);
    assert.equal((await invoke({ message: "a".repeat(8001) })).status, 413);
    assert.equal((await invoke({ history: Array.from({ length: 21 }, () => ({ text: "x" })) })).status, 413);
    assert.equal(
      (
        await invoke({
          householdId: "household-id",
          attachments: [{
            mimeType: "image/png",
            sizeBytes: 1,
            dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
          }],
        })
      ).status,
      400
    );
    assert.equal(
      (await invoke({ attachments: Array.from({ length: 5 }, () => ({})), message: "hi" })).status,
      400
    );
    assert.equal(authCalls(), 4);
  } finally {
    global.fetch = previousFetch;
  }
});
