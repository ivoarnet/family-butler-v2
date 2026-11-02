const { randomUUID } = require("crypto");
const { cleanString, isIsoDate } = require("./eventModel");

const isValidDate = (value) => {
  if (!isIsoDate(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const addWorkdays = (date, count) => {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  let added = 0;
  while (added < count) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return result.toISOString().slice(0, 10);
};

const defaultDueDate = (now = new Date()) => addWorkdays(now, 3);

module.exports = function createTasksTool({ db, householdId, householdState, userId, toClientError }) {
  const members = Array.isArray(householdState.members) ? householdState.members : [];
  const memberById = new Map(members.map((member) => [member.id, member]));
  return {
    definition: {
      name: "manage_tasks",
      description: [
        "Read, create, and complete tasks in the current household.",
        "Use list to find open tasks before completing a task; only complete a clearly matching open task.",
        "Create tasks directly when requested. If no assignee is specified, the first household member is the default.",
        "New tasks default to a 1-coin reward and a due date three UTC workdays from today when no due date is provided.",
        "For an upcoming event that suggests preparation, check open tasks for duplicates and ask before creating the suggested task.",
        "Task coins are earned labels, not spendable balances.",
        `Household members: ${members.map((member) => `${member.firstName} (id=${member.id})`).join("; ") || "none configured"}`,
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["list", "create", "complete"] },
          query: { type: "string" },
          taskId: { type: "string" },
          title: { type: "string" },
          memberId: { type: "string" },
          coins: { type: "integer", minimum: 0, maximum: 1000000 },
          dueDate: { type: "string" },
          repeatRule: { type: "string", enum: ["none", "daily", "weekly"] },
        },
        required: ["action"],
      },
    },
    async execute(args) {
      const action = args?.action;
      if (action === "list") {
        const result = await db.getTasks(householdId, userId, { status: "open" });
        const query = cleanString(args?.query).toLowerCase();
        const tasks = result.tasks
          .filter((task) => !query || task.title.toLowerCase().includes(query))
          .slice(0, 100)
          .map((task) => ({
            id: task.id,
            title: task.title,
            memberId: task.memberId,
            memberName: memberById.get(task.memberId)?.firstName ?? null,
            coins: task.coins,
            dueDate: task.dueDate,
            repeatRule: task.repeatRule,
            status: task.status,
            revision: task.revision,
          }));
        return { ok: true, count: tasks.length, tasks };
      }

      if (action === "create") {
        const title = cleanString(args?.title);
        if (!title || [...title].length > 160 || /[\u0000-\u001f\u007f]/u.test(title)) {
          throw toClientError("task title must contain 1 to 160 valid characters");
        }
        if (!members.length) throw toClientError("Add a household member before creating a task");
        const memberId = cleanString(args?.memberId) || members[0].id;
        if (!memberById.has(memberId)) throw toClientError("task memberId is not part of this household");
        const coins = args?.coins === undefined ? 1 : args.coins;
        if (!Number.isInteger(coins) || coins < 0 || coins > 1000000) {
          throw toClientError("task coins must be a non-negative whole number up to 1,000,000");
        }
        const dueDate = args?.dueDate == null ? defaultDueDate() : args.dueDate;
        if (dueDate !== null && (typeof dueDate !== "string" || !isValidDate(dueDate))) {
          throw toClientError("task dueDate must use a valid YYYY-MM-DD date or null");
        }
        const repeatRule = args?.repeatRule ?? "none";
        if (!["none", "daily", "weekly"].includes(repeatRule) || (repeatRule !== "none" && dueDate === null)) {
          throw toClientError("invalid task repeatRule or dueDate");
        }
        const task = { id: randomUUID(), title, memberId, coins, dueDate, repeatRule };
        await db.mutateTasks(householdId, userId, "create", task);
        return {
          ok: true,
          task: { ...task, memberName: memberById.get(memberId).firstName, status: "todo" },
        };
      }

      if (action === "complete") {
        const taskId = cleanString(args?.taskId);
        if (!taskId) throw toClientError("taskId is required to complete a task");
        const result = await db.getTasks(householdId, userId, { status: "open" });
        const task = result.tasks.find((candidate) => candidate.id === taskId);
        if (!task) throw toClientError("Open task not found");
        await db.mutateTasks(householdId, userId, "update", {
          id: task.id,
          revision: task.revision,
          title: task.title,
          memberId: task.memberId,
          coins: task.coins,
          dueDate: task.dueDate,
          repeatRule: task.repeatRule,
          status: "done",
        });
        return { ok: true, taskId: task.id, title: task.title, coinsEarned: task.coins };
      }

      throw toClientError("action must be list, create, or complete");
    },
  };
};

module.exports.defaultDueDate = defaultDueDate;
