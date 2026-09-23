const db = require("../shared/db");

module.exports = async function tasks(context, req) {
  try {
    if (req.method === "GET") {
      const allTasks = await db.listTasks();
      context.res = {
        status: 200,
        body: allTasks,
      };
      return;
    }

    if (req.method === "POST") {
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

      if (!title) {
        context.res = {
          status: 400,
          body: { error: "title is required" },
        };
        return;
      }

      const task = await db.createTask(title);

      context.res = {
        status: 201,
        body: task,
      };
      return;
    }

    context.res = {
      status: 405,
      body: { error: "method not allowed" },
    };
  } catch (error) {
    context.log.error("tasks handler failed", error);
    context.res = {
      status: 500,
      body: { error: error instanceof Error ? error.message : "Internal server error" },
    };
  }
};
