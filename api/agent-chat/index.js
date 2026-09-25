const { getAuthenticatedUserId } = require("../shared/auth");
const agentProvider = require("../shared/agent/providers");
const db = require("../shared/db");
const createAgentTools = require("../shared/agent/tools");

const PDF_MIME = "application/pdf";
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic"]);
const ALLOWED_MIME_TYPES = new Set([PDF_MIME, ...IMAGE_MIME_TYPES]);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_FILE_BYTES = parsePositiveInt(process.env.AGENT_MAX_FILE_BYTES, 5 * 1024 * 1024);
const MAX_FILES_PER_MESSAGE = parsePositiveInt(process.env.AGENT_MAX_FILES_PER_MESSAGE, 4);

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const toClientError = (message) => Object.assign(new Error(message), { statusCode: 400 });

const normalizeAttachment = (attachment, index) => {
  const name = cleanString(attachment?.name) || `attachment-${index + 1}`;
  const mimeType = cleanString(attachment?.mimeType).toLowerCase();
  const dataBase64 = cleanString(attachment?.dataBase64);
  const sizeBytes = Number.parseInt(String(attachment?.sizeBytes), 10);

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw toClientError(`Unsupported attachment type for ${name}`);
  }

  if (!dataBase64) {
    throw toClientError(`Attachment payload is missing for ${name}`);
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw toClientError(`Attachment size is invalid for ${name}`);
  }

  if (sizeBytes > MAX_FILE_BYTES) {
    throw toClientError(`Attachment exceeds max size for ${name}`);
  }

  return {
    name,
    mimeType,
    dataBase64,
    sizeBytes,
    kind: mimeType === PDF_MIME ? "pdf" : "image",
  };
};

module.exports = async function agentChat(context, req) {
  try {
    const userId = await getAuthenticatedUserId(req.headers);
    if (!userId) {
      context.res = {
        status: 401,
        body: { error: "Unauthorized" },
      };
      return;
    }

    const message = cleanString(req.body?.message);
    const householdId = cleanString(req.body?.householdId);
    const incomingAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

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

    const householdState = await db.getHouseholdWithRelations(householdId, userId);
    if (!householdState) {
      context.res = {
        status: 404,
        body: { error: "Household not found" },
      };
      return;
    }

    if (incomingAttachments.length > MAX_FILES_PER_MESSAGE) {
      context.res = {
        status: 400,
        body: { error: `Maximum ${MAX_FILES_PER_MESSAGE} attachments are allowed` },
      };
      return;
    }

    const attachments = incomingAttachments.map(normalizeAttachment);

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

    const providerResponse = await agentProvider.sendMessage({
      userId,
      message: message || "Analyze the attached files.",
      attachments,
      tools: agentTools.definitions,
      executeTool: (toolName, args) => agentTools.executeTool(toolName, args),
    });

    context.res = {
      status: 200,
      body: {
        reply: providerResponse.reply,
        provider: "openai",
        model: providerResponse.model,
      },
    };
  } catch (error) {
    context.log.error("agent chat handler failed", error instanceof Error ? error.message : error);
    const statusCode = typeof error?.statusCode === "number" ? error.statusCode : 500;
    context.res = {
      status: statusCode,
      body: {
        error: error instanceof Error && error.message ? error.message : statusCode === 500 ? "Internal server error" : "Request failed",
      },
    };
  }
};
