export type TaskStatus = "todo" | "in_progress" | "done";
export type RepeatRule = "none" | "daily" | "weekly";

export interface Task {
  id: string;
  householdId: string;
  title: string;
  memberId: string;
  coins: number;
  status: TaskStatus;
  sortOrder: number;
  dueDate: string | null;
  repeatRule: RepeatRule;
  seriesId: string | null;
  completedAt: string | null;
  revision: number;
}

export type TaskFields = Pick<Task, "title" | "memberId" | "coins" | "dueDate" | "repeatRule">;
export const taskColumns: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];
