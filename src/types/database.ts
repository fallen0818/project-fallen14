// =============================================================================
// Domain types — mirror the SQL schema in supabase/schema.sql
// =============================================================================

export type ProjectStatus = "draft" | "active" | "flagged" | "completed";
export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type SubtaskStatus = "pending" | "in_progress" | "completed";
export type Priority = "low" | "medium" | "high" | "urgent";
export type UserRole = "analyst" | "manager" | "admin";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UnitDistribution {
  id: string;
  project_id: string;
  engineering_heads: number;
  design_ux_leads: number;
  qa_count: number;
  data_gov_count: number;
}

export interface Project {
  id: string;
  title: string;
  category: string | null;
  summary: string | null;
  initial_allocation: number | null;
  projected_roi: number | null;
  fiscal_commencement: string | null;
  implementing_department: string | null;
  status: ProjectStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

/** Project joined with its 1:1 unit distribution and funding sources. */
export interface ProjectWithRelations extends Project {
  unit_distribution: UnitDistribution | null;
  project_funding_sources: { id: string; source: string }[];
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: SubtaskStatus;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Task joined with its subtasks and a light project reference. */
export interface TaskWithRelations extends Task {
  subtasks: Subtask[];
  projects: { id: string; title: string } | null;
}

// ---- Write payloads ---------------------------------------------------------

export interface ProjectInput {
  title: string;
  category: string | null;
  summary: string | null;
  initial_allocation: number | null;
  projected_roi: number | null;
  fiscal_commencement: string | null;
  implementing_department: string | null;
  status: ProjectStatus;
}

export interface UnitDistributionInput {
  engineering_heads: number;
  design_ux_leads: number;
  qa_count: number;
  data_gov_count: number;
}

export interface TaskInput {
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
}

export interface SubtaskInput {
  task_id: string;
  title: string;
  description?: string | null;
  status?: SubtaskStatus;
  due_date?: string | null;
  sort_order?: number;
}
