import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, TaskInput, TaskWithRelations } from "@/types/database";

const TASK_SELECT = `
  *,
  projects ( id, title ),
  subtasks (
    id, task_id, title, description, assigned_to, status,
    due_date, completed_at, sort_order, created_by, created_at, updated_at
  )
`;

export async function getTasks(
  supabase: SupabaseClient,
  projectId?: string | null,
): Promise<TaskWithRelations[]> {
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("created_at", { ascending: true });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw error;

  // Ensure subtasks come back ordered.
  const tasks = (data ?? []) as TaskWithRelations[];
  tasks.forEach((t) => t.subtasks?.sort((a, b) => a.sort_order - b.sort_order));
  return tasks;
}

export async function createTask(
  supabase: SupabaseClient,
  createdBy: string,
  input: TaskInput,
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...input, created_by: createdBy })
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<TaskInput> & { status?: Task["status"] },
): Promise<Task> {
  const patch: Record<string, unknown> = { ...updates };

  // Keep completed_at consistent with status.
  if (updates.status === "completed") {
    patch.completed_at = new Date().toISOString();
  } else if (updates.status) {
    patch.completed_at = null;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function deleteTask(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
