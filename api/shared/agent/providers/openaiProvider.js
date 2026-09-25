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

    async sendMessage({ message, attachments }) {
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

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: ["Bearer", apiKey].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "user",
              content,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(await parseProviderError(response));
      }

      const payload = await response.json();
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
