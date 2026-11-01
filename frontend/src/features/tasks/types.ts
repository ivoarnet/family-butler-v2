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

export interface TaskLeaderboardEntry {
  memberId: string;
  firstName: string;
  avatarColor: string | null;
  coins: number;
}

export interface TaskLeaderboard {
  week: TaskLeaderboardEntry[];
  month: TaskLeaderboardEntry[];
}

export type TaskFields = Pick<Task, "title" | "memberId" | "coins" | "dueDate" | "repeatRule">;
export type TaskUpdateFields = TaskFields & Pick<Task, "status">;
export const taskColumns: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];
