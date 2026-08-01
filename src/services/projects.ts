import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Project,
  ProjectInput,
  ProjectWithRelations,
  UnitDistributionInput,
} from "@/types/database";

const PROJECT_SELECT = `
  *,
  unit_distribution ( * ),
  project_funding_sources ( id, source )
`;

export async function getProjects(
  supabase: SupabaseClient,
): Promise<ProjectWithRelations[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProjectWithRelations[];
}

export async function getProjectById(
  supabase: SupabaseClient,
  id: string,
): Promise<ProjectWithRelations> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as ProjectWithRelations;
}

export async function createProject(
  supabase: SupabaseClient,
  ownerId: string,
  input: ProjectInput,
  unit: UnitDistributionInput,
  fundingSources: string[],
): Promise<Project> {
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ ...input, owner_id: ownerId })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("unit_distribution")
    .insert({ project_id: project.id, ...unit });

  if (fundingSources.length > 0) {
    await supabase.from("project_funding_sources").insert(
      fundingSources.map((source) => ({ project_id: project.id, source })),
    );
  }

  return project as Project;
}

export async function updateProject(
  supabase: SupabaseClient,
  id: string,
  input: ProjectInput,
  unit: UnitDistributionInput,
  fundingSources: string[],
): Promise<Project> {
  const { data: project, error } = await supabase
    .from("projects")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Upsert the 1:1 unit distribution.
  await supabase
    .from("unit_distribution")
    .upsert({ project_id: id, ...unit }, { onConflict: "project_id" });

  // Replace funding sources (simplest correct approach for a small set).
  await supabase.from("project_funding_sources").delete().eq("project_id", id);
  if (fundingSources.length > 0) {
    await supabase.from("project_funding_sources").insert(
      fundingSources.map((source) => ({ project_id: id, source })),
    );
  }

  return project as Project;
}

export async function deleteProject(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}
