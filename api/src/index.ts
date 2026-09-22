import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/tasks", async (_req, res) => {
  const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" } });
  res.json(tasks);
});

app.post("/api/tasks", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const task = await prisma.task.create({
    data: { title }
  });

  res.status(201).json(task);
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
