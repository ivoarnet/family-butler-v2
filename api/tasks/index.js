const prisma = require("../shared/prisma");

module.exports = async function tasks(context, req) {
  if (req.method === "GET") {
    const allTasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" } });
    context.res = {
      status: 200,
      body: allTasks
    };
    return;
  }

  if (req.method === "POST") {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

    if (!title) {
      context.res = {
        status: 400,
        body: { error: "title is required" }
      };
      return;
    }

    const task = await prisma.task.create({
      data: { title }
    });

    context.res = {
      status: 201,
      body: task
    };
    return;
  }

  context.res = {
    status: 405,
    body: { error: "method not allowed" }
  };
};
