const { getAuthenticatedUserId } = require("../shared/auth");
const agentProvider = require("../shared/agent/providers");
const db = require("../shared/db");
const createAgentTools = require("../shared/agent/tools");
const defaultInstruction = require("../shared/agent/instructions/defaultInstruction");
const { randomUUID } = require("crypto");
const { normalizeAttachment, toClientError } = require("../shared/agent/requestValidation");

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_FILE_BYTES = parsePositiveInt(process.env.AGENT_MAX_FILE_BYTES, 5 * 1024 * 1024);
const MAX_FILES_PER_MESSAGE = parsePositiveInt(process.env.AGENT_MAX_FILES_PER_MESSAGE, 4);
const MAX_REQUEST_BYTES = parsePositiveInt(process.env.AGENT_MAX_REQUEST_BYTES, 30 * 1024 * 1024);
const MAX_TOTAL_FILE_BYTES = parsePositiveInt(process.env.AGENT_MAX_TOTAL_FILE_BYTES, 20 * 1024 * 1024);
const MAX_MESSAGE_CHARS = parsePositiveInt(process.env.AGENT_MAX_MESSAGE_CHARS, 8000);
const MAX_HISTORY_ITEMS = parsePositiveInt(process.env.AGENT_MAX_HISTORY_ITEMS, 20);
const MAX_HISTORY_ITEM_CHARS = parsePositiveInt(process.env.AGENT_MAX_HISTORY_ITEM_CHARS, 4000);
const MAX_HISTORY_CHARS = parsePositiveInt(process.env.AGENT_MAX_HISTORY_CHARS, 20000);
const MAX_EXECUTION_MS = parsePositiveInt(process.env.AGENT_MAX_EXECUTION_MS, 45000);
const USER_DAILY_LIMIT = parsePositiveInt(process.env.AGENT_USER_DAILY_LIMIT, 40);
const HOUSEHOLD_DAILY_LIMIT = parsePositiveInt(process.env.AGENT_HOUSEHOLD_DAILY_LIMIT, 100);
const USER_CONCURRENCY_LIMIT = parsePositiveInt(process.env.AGENT_USER_CONCURRENCY_LIMIT, 2);
const HOUSEHOLD_CONCURRENCY_LIMIT = parsePositiveInt(process.env.AGENT_HOUSEHOLD_CONCURRENCY_LIMIT, 3);
const RESERVATION_TIMEOUT_SECONDS = parsePositiveInt(process.env.AGENT_RESERVATION_TIMEOUT_SECONDS, 120);

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const toTooLargeError = (message) => toClientError(message, 413);
const getContentLength = (headers) => {
  const value = headers?.["content-length"] ?? headers?.["Content-Length"];
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw toClientError("Content-Length is invalid");
  }
  return parsed;
};

const buildRuntimeDateContext = () => {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const isoNow = now.toISOString();
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(now);

  return [
    `Current date-time (UTC): ${isoNow}`,
    `Current weekday (UTC): ${weekday}`,
    `Server timezone: ${timezone}`,
    "When users provide relative dates (for example tomorrow, next Wednesday, or Saturday), resolve them against the current UTC date-time above before calling tools.",
  ].join(" ");
};
const normalizeHistory = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }

  if (history.length > MAX_HISTORY_ITEMS) {
    throw toTooLargeError(`Maximum ${MAX_HISTORY_ITEMS} history items are allowed`);
  }

  let totalChars = 0;
  const normalizedHistory = [];
  for (const item of history) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const text = typeof item.text === "string" ? item.text : "";
    if (text.length > MAX_HISTORY_ITEM_CHARS) {
      throw toTooLargeError(`History items may not exceed ${MAX_HISTORY_ITEM_CHARS} characters`);
    }
    totalChars += text.length;
    if (totalChars > MAX_HISTORY_CHARS) {
      throw toTooLargeError(`History may not exceed ${MAX_HISTORY_CHARS} characters`);
    }

    const normalizedText = cleanString(text);
    if (normalizedText) {
      normalizedHistory.push({
        role: item.role === "assistant" ? "assistant" : "user",
        text: normalizedText,
      });
    }
  }
  return normalizedHistory;
};

module.exports = async function agentChat(context, req) {
  try {
    const rawBodyBytes =
      typeof req.rawBody === "string" || Buffer.isBuffer(req.rawBody) ? Buffer.byteLength(req.rawBody) : 0;
    if (Math.max(getContentLength(req.headers) ?? 0, rawBodyBytes) > MAX_REQUEST_BYTES) {
      throw toTooLargeError("Request exceeds the maximum allowed size");
    }

    const userId = await getAuthenticatedUserId(req.headers);
    if (!userId) {
      context.res = {
        status: 401,
        body: { error: "Unauthorized" },
      };
      return;
    }

    const rawMessage = req.body?.message;
    if (typeof rawMessage === "string" && rawMessage.length > MAX_MESSAGE_CHARS) {
      throw toTooLargeError(`Message may not exceed ${MAX_MESSAGE_CHARS} characters`);
    }
    const message = cleanString(req.body?.message);
    if (typeof req.body?.householdId === "string" && req.body.householdId.length > 128) {
      throw toTooLargeError("householdId is too long");
    }
    const householdId = cleanString(req.body?.householdId);
    const history = normalizeHistory(req.body?.history);
    const incomingAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (incomingAttachments.length > MAX_FILES_PER_MESSAGE) {
      throw toClientError(`Maximum ${MAX_FILES_PER_MESSAGE} attachments are allowed`);
    }

    let encodedAttachmentBytes = 0;
    for (const attachment of incomingAttachments) {
      encodedAttachmentBytes += typeof attachment?.dataBase64 === "string" ? attachment.dataBase64.length : 0;
      if (encodedAttachmentBytes > MAX_REQUEST_BYTES) {
        throw toTooLargeError("Request exceeds the maximum allowed size");
      }
    }

    if (!message && incomingAttachments.length === 0) {
      context.res = {
        status: 400,
        body: { error: "message or attachments are required" },
      };
      return;
    }

    if (!householdId) {
      context.res = {
        status: 400,
        body: { error: "householdId is required" },
      };
      return;
    }

    const attachments = incomingAttachments.map((attachment, index) =>
      normalizeAttachment(attachment, index, MAX_FILE_BYTES)
    );
    if (attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0) > MAX_TOTAL_FILE_BYTES) {
      throw toTooLargeError("Attachments exceed the maximum combined size");
    }

    const householdState = await db.getHouseholdWithRelations(householdId, userId);
    if (!householdState) {
      context.res = {
        status: 404,
        body: { error: "Household not found" },
      };
      return;
    }

    const agentTools = createAgentTools({ db, householdId, householdState, toClientError });

    if (attachments.some((attachment) => attachment.kind === "pdf") && !agentProvider.supportsPdf()) {
      context.res = {
        status: 400,
        body: { error: "Configured model provider does not support PDF attachments" },
      };
      return;
    }

    if (attachments.some((attachment) => attachment.kind === "image") && !agentProvider.supportsVision()) {
      context.res = {
        status: 400,
        body: { error: "Configured model provider does not support image attachments" },
      };
      return;
    }

    const executionId = randomUUID();
    const reservation = await db.reserveAgentExecution({
      executionId,
      userId,
      householdId,
      userDailyLimit: USER_DAILY_LIMIT,
      householdDailyLimit: HOUSEHOLD_DAILY_LIMIT,
      userConcurrencyLimit: USER_CONCURRENCY_LIMIT,
      householdConcurrencyLimit: HOUSEHOLD_CONCURRENCY_LIMIT,
      reservationTimeoutSeconds: RESERVATION_TIMEOUT_SECONDS,
    });
    if (!reservation) {
      context.log.warn("agent execution budget rejected");
      context.res = {
        status: 429,
        body: { error: "Agent usage or concurrency limit reached. Please try again later." },
      };
      return;
    }

    const executionStartedAt = Date.now();
    try {
      context.log("agent execution started", {
        attachmentCount: attachments.length,
        attachmentBytes: attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0),
        historyItems: history.length,
      });
      const signal = AbortSignal.timeout(MAX_EXECUTION_MS);
      const providerResponse = await agentProvider.sendMessage({
        userId,
        message: message || "Analyze the attached files.",
        history,
        attachments,
        tools: agentTools.definitions,
        executeTool: (toolName, args) =>
          new Promise((resolve, reject) => {
            if (signal.aborted) {
              reject(new Error("Execution budget exceeded"));
              return;
            }

            const onAbort = () => reject(new Error("Execution budget exceeded"));
            signal.addEventListener("abort", onAbort, { once: true });
            Promise.resolve(agentTools.executeTool(toolName, args))
              .then(resolve, reject)
              .finally(() => signal.removeEventListener("abort", onAbort));
          }),
        instruction: `${defaultInstruction} ${buildRuntimeDateContext()}`,
        signal,
      });

      context.res = {
        status: 200,
        body: {
          reply: providerResponse.reply,
          provider: "openai",
          model: providerResponse.model,
        },
      };
    } finally {
      context.log("agent execution finished", { durationMs: Date.now() - executionStartedAt });
      try {
        await db.finishAgentExecution(executionId);
      } catch (_error) {
        context.log.warn("agent execution reservation could not be released");
      }
    }
  } catch (error) {
    context.log.error("agent chat request rejected or failed", {
      statusCode: typeof error?.statusCode === "number" ? error.statusCode : 500,
    });
    const statusCode = typeof error?.statusCode === "number" ? error.statusCode : 500;
    context.res = {
      status: statusCode,
      body: {
        error: error instanceof Error && statusCode !== 500 && error.message
          ? error.message
          : statusCode === 500 ? "Internal server error" : "Request failed",
      },
    };
  }
};
