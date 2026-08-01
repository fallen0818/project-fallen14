import { notFound, redirect } from "next/navigation";
import { entitiesForModule } from "@/lib/crud/configs";
import type { EntityConfig } from "@/lib/crud/types";

export default async function ModuleIndex({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const entities = entitiesForModule(module as EntityConfig["module"]);
  if (entities.length === 0) notFound();
  redirect(`/${module}/${entities[0].key}`);
}
