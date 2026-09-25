const createOpenAiProvider = require("./openaiProvider");

let provider;

const getProvider = () => {
  if (provider) {
    return provider;
  }

  const configuredProvider = (process.env.LLM_PROVIDER || "openai").trim().toLowerCase();
  if (configuredProvider !== "openai") {
    throw new Error(`Unsupported LLM_PROVIDER: ${configuredProvider}`);
  }

  provider = createOpenAiProvider();
  return provider;
};

module.exports = {
  sendMessage: (...args) => getProvider().sendMessage(...args),
  supportsVision: (...args) => getProvider().supportsVision(...args),
  supportsPdf: (...args) => getProvider().supportsPdf(...args),
};
