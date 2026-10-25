const assert = require("node:assert/strict");
const test = require("node:test");

const createOpenAiProvider = require("./shared/agent/providers/openaiProvider");

const functionCall = (callId, name, args) => ({
  type: "function_call",
  call_id: callId,
  name,
  arguments: JSON.stringify(args),
});

const setupProvider = (calls, onNextRequest) => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  let requestCount = 0;
  const requests = [];
  global.fetch = async (_url, options) => {
    requestCount += 1;
    const request = JSON.parse(options.body);
    requests.push(request);
    const payload =
      requestCount === 1
        ? { id: "response-1", output: calls }
        : onNextRequest(request);
    return {
      ok: true,
      json: async () => payload,
    };
  };

  return {
    provider: createOpenAiProvider(),
    requests,
    restore() {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
      global.fetch = previousFetch;
    },
  };
};

const sendMessage = (provider, executeTool) =>
  provider.sendMessage({
    message: "Please update the household.",
    attachments: [],
    executeTool,
  });

test("caps output tokens and declines excessive calls before executing tools", async () => {
  const previousOutputLimit = process.env.AGENT_MAX_OUTPUT_TOKENS;
  const previousCallLimit = process.env.AGENT_MAX_TOOL_CALLS_PER_RESPONSE;
  process.env.AGENT_MAX_OUTPUT_TOKENS = "7";
  process.env.AGENT_MAX_TOOL_CALLS_PER_RESPONSE = "1";
  const setup = setupProvider(
    [
      functionCall("call-1", "add_event", { title: "First" }),
      functionCall("call-2", "add_event", { title: "Second" }),
    ],
    () => ({ id: "response-2", output_text: "Not expected" })
  );
  let executedToolCalls = 0;

  try {
    const result = await sendMessage(setup.provider, async () => {
      executedToolCalls += 1;
      return { ok: true };
    });
    assert.equal(setup.requests.length, 1);
    assert.equal(setup.requests[0].max_output_tokens, 7);
    assert.equal(executedToolCalls, 0);
    assert.match(result.reply, /execution budget/);
  } finally {
    setup.restore();
    if (previousOutputLimit === undefined) delete process.env.AGENT_MAX_OUTPUT_TOKENS;
    else process.env.AGENT_MAX_OUTPUT_TOKENS = previousOutputLimit;
    if (previousCallLimit === undefined) delete process.env.AGENT_MAX_TOOL_CALLS_PER_RESPONSE;
    else process.env.AGENT_MAX_TOOL_CALLS_PER_RESPONSE = previousCallLimit;
  }
});

test("returns a bounded reply when the execution deadline is already exhausted", async () => {
  const setup = setupProvider([], () => ({ id: "unused", output_text: "unused" }));
  const signal = AbortSignal.abort();

  try {
    const result = await setup.provider.sendMessage({
      message: "Please update the household.",
      attachments: [],
      executeTool: async () => ({ ok: true }),
      signal,
    });
    assert.equal(setup.requests.length, 0);
    assert.match(result.reply, /execution budget/);
  } finally {
    setup.restore();
  }
});

test("bounds tool output passed back into the model context", async () => {
  const previousResultLimit = process.env.AGENT_MAX_TOOL_RESULT_CHARS;
  process.env.AGENT_MAX_TOOL_RESULT_CHARS = "20";
  let toolOutputs;
  const setup = setupProvider(
    [functionCall("call-1", "get_events", {})],
    (request) => {
      toolOutputs = request.input;
      return { id: "response-2", output_text: "Done." };
    }
  );

  try {
    await sendMessage(setup.provider, async () => ({ data: "x".repeat(100) }));
    assert.deepEqual(JSON.parse(toolOutputs[0].output), {
      ok: false,
      error: "Tool result exceeded the output limit",
    });
  } finally {
    setup.restore();
    if (previousResultLimit === undefined) delete process.env.AGENT_MAX_TOOL_RESULT_CHARS;
    else process.env.AGENT_MAX_TOOL_RESULT_CHARS = previousResultLimit;
  }
});

test("executes same-turn writes sequentially before dependent reads", async () => {
  const nextRequest = { id: "response-2", output_text: "Both events were saved." };
  const setup = setupProvider(
    [
      functionCall("call-1", "add_event", { title: "First" }),
      functionCall("call-2", "add_event", { title: "Second" }),
      functionCall("call-3", "get_events", {}),
    ],
    () => nextRequest
  );
  const state = { events: [] };
  const snapshots = [];
  let observedEvents;

  try {
    await sendMessage(setup.provider, async (name, args) => {
      if (name === "get_events") {
        observedEvents = [...state.events];
        return { events: [...state.events] };
      }

      const updatedEvents = [...state.events, args.title];
      await Promise.resolve();
      state.events = updatedEvents;
      snapshots.push([...state.events]);
      return { ok: true, events: [...state.events] };
    });

    assert.deepEqual(snapshots, [["First"], ["First", "Second"]]);
    assert.deepEqual(state.events, ["First", "Second"]);
    assert.deepEqual(observedEvents, ["First", "Second"]);
  } finally {
    setup.restore();
  }
});

test("passes failed tool results to the model without hiding committed writes", async () => {
  let toolOutputs;
  const setup = setupProvider(
    [
      functionCall("call-1", "add_event", { title: "Saved" }),
      functionCall("call-2", "add_event", { title: "Failed" }),
      functionCall("call-3", "get_events", {}),
    ],
    (request) => {
      toolOutputs = request.input;
      return { id: "response-2", output_text: "One event was saved; the other failed." };
    }
  );
  const state = { events: [] };

  try {
    await sendMessage(setup.provider, async (name, args) => {
      if (name === "get_events") {
        return { events: [...state.events] };
      }
      if (args.title === "Failed") {
        throw new Error("Could not save event.");
      }
      state.events = [...state.events, args.title];
      return { ok: true, event: args.title };
    });

    assert.deepEqual(
      toolOutputs.map((output) => JSON.parse(output.output)),
      [
        { ok: true, event: "Saved" },
        { ok: false, error: "Could not save event." },
        { events: ["Saved"] },
      ]
    );
    assert.deepEqual(
      toolOutputs.map((output) => output.call_id),
      ["call-1", "call-2", "call-3"]
    );
  } finally {
    setup.restore();
  }
});
