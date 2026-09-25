const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const parseProviderError = async (response) => {
  try {
    const payload = await response.json();
    if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
      return payload.error.message;
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch (_error) {
    // ignore parse errors
  }

  return `OpenAI request failed with status ${response.status}`;
};

const readTextFromOutput = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  for (const outputItem of payload.output) {
    if (!Array.isArray(outputItem?.content)) {
      continue;
    }

    for (const contentPart of outputItem.content) {
      if (typeof contentPart?.text === "string" && contentPart.text.trim()) {
        return contentPart.text;
      }
    }
  }

  return "";
};

const readFunctionCallsFromOutput = (payload) => {
  if (!Array.isArray(payload?.output)) {
    return [];
  }

  return payload.output.filter((item) => item?.type === "function_call" && typeof item?.call_id === "string" && typeof item?.name === "string");
};

const toOpenAiTools = (tools) =>
  tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

module.exports = function createOpenAiProvider() {
  const apiKey = cleanString(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be configured");
  }

  const chatModel = cleanString(process.env.OPENAI_MODEL_CHAT) || "gpt-4.1-mini";
  const visionModel = cleanString(process.env.OPENAI_MODEL_VISION) || chatModel;

  return {
    supportsVision() {
      return true;
    },

    supportsPdf() {
      return true;
    },

    async sendMessage({ message, attachments, tools = [], executeTool }) {
      const hasImage = attachments.some((attachment) => attachment.kind === "image");
      const model = hasImage ? visionModel : chatModel;

      const content = [{ type: "input_text", text: message }];

      for (const attachment of attachments) {
        const dataUrl = `data:${attachment.mimeType};base64,${attachment.dataBase64}`;
        if (attachment.kind === "pdf") {
          content.push({
            type: "input_file",
            filename: attachment.name,
            file_data: dataUrl,
          });
          continue;
        }

        content.push({
          type: "input_image",
          image_url: dataUrl,
        });
      }

      let payload;
      let previousResponseId;
      let pendingInput = [
        {
          role: "user",
          content,
        },
      ];

      for (let iteration = 0; iteration < 4; iteration += 1) {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: ["Bearer", apiKey].join(" "),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: pendingInput,
            tools: tools.length > 0 ? toOpenAiTools(tools) : undefined,
            previous_response_id: previousResponseId,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseProviderError(response));
        }

        payload = await response.json();
        previousResponseId = typeof payload?.id === "string" ? payload.id : previousResponseId;

        const functionCalls = readFunctionCallsFromOutput(payload);
        if (functionCalls.length === 0) {
          break;
        }

        if (typeof executeTool !== "function") {
          throw new Error("Tool call requested but no tool executor is configured");
        }

        pendingInput = await Promise.all(
          functionCalls.map(async (call) => {
            let parsedArguments = {};
            try {
              parsedArguments = call.arguments ? JSON.parse(call.arguments) : {};
            } catch (_error) {
              parsedArguments = {};
            }

            const result = await executeTool(call.name, parsedArguments);
            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(result ?? { ok: true }),
            };
          })
        );
      }

      const reply = readTextFromOutput(payload);
      if (!reply) {
        throw new Error("OpenAI response did not include assistant text");
      }

      return {
        reply,
        model,
      };
    },
  };
};
