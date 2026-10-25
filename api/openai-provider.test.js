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
  global.fetch = async (_url, options) => {
    requestCount += 1;
    const request = JSON.parse(options.body);
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
