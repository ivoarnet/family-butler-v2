const createAddContactTool = require("./addContactTool");
const createGetNextBirthdayTool = require("./getNextBirthdayTool");

module.exports = function createAgentTools(context) {
  const toolModules = [createAddContactTool(context), createGetNextBirthdayTool(context)];
  const definitions = toolModules.map((tool) => tool.definition);

  const executors = new Map(toolModules.map((tool) => [tool.definition.name, tool.execute]));

  return {
    definitions,
    async executeTool(name, args) {
      const executor = executors.get(name);
      if (!executor) {
        throw context.toClientError(`Unsupported tool: ${name}`);
      }
      return executor(args);
    },
  };
};
