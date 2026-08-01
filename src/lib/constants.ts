import type { ProjectStatus, TaskStatus, SubtaskStatus, Priority } from "@/types/database";

export const PROJECT_CATEGORIES = [
  "Internal Infrastructure",
  "Client-Facing Digital",
  "Compliance & Security",
  "R&D Innovation",
] as const;

export const DEPARTMENTS = [
  "IT",
  "Finance",
  "HR",
  "Operations",
  "Legal",
  "Marketing",
  "Engineering",
] as const;

export const FUNDING_SOURCES = [
  "Capital Reserve",
  "Operating Budget",
  "Grant Funding",
  "External Investment",
  "Departmental Allocation",
] as const;

export const PROJECT_STATUSES: ProjectStatus[] = ["draft", "active", "flagged", "completed"];
export const TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "completed", "blocked"];
export const SUBTASK_STATUSES: SubtaskStatus[] = ["pending", "in_progress", "completed"];
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  flagged: "Flagged",
  completed: "Completed",
  pending: "Pending",
  in_progress: "In Progress",
  blocked: "Blocked",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
