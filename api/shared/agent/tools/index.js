const createAddContactTool = require("./addContactTool");
const createGetNextBirthdayTool = require("./getNextBirthdayTool");
const createGetContactsTool = require("./getContactsTool");
const createGetDayConfigurationsTool = require("./getDayConfigurationsTool");
const createAddDayConfigurationsTool = require("./addDayConfigurationsTool");

module.exports = function createAgentTools(context) {
  const toolModules = [
    createAddContactTool(context),
    createGetNextBirthdayTool(context),
    createGetContactsTool(context),
    createGetDayConfigurationsTool(context),
    createAddDayConfigurationsTool(context),
  ];
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
