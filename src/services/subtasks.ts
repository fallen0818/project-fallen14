import type { SupabaseClient } from "@supabase/supabase-js";
import type { Subtask, SubtaskInput } from "@/types/database";

export async function createSubtask(
  supabase: SupabaseClient,
  createdBy: string,
  input: SubtaskInput,
): Promise<Subtask> {
  let sortOrder = input.sort_order;

  if (sortOrder === undefined) {
    const { data: last } = await supabase
      .from("subtasks")
      .select("sort_order")
      .eq("task_id", input.task_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    sortOrder = last && last.length > 0 ? last[0].sort_order + 1 : 0;
  }

  const { data, error } = await supabase
    .from("subtasks")
    .insert({ ...input, sort_order: sortOrder, created_by: createdBy })
    .select()
    .single();

  if (error) throw error;
  return data as Subtask;
}

export async function updateSubtask(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<SubtaskInput> & { status?: Subtask["status"] },
): Promise<Subtask> {
  const patch: Record<string, unknown> = { ...updates };

  if (updates.status === "completed") {
    patch.completed_at = new Date().toISOString();
  } else if (updates.status) {
    patch.completed_at = null;
  }

  const { data, error } = await supabase
    .from("subtasks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Subtask;
}

export async function deleteSubtask(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("subtasks").delete().eq("id", id);
  if (error) throw error;
}
