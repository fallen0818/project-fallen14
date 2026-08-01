import { notFound } from "next/navigation";
import { ENTITIES_BY_KEY } from "@/lib/crud/configs";
import { EntityManager } from "@/components/crud/EntityManager";

export default async function EntityPage({
  params,
}: {
  params: Promise<{ module: string; entity: string }>;
}) {
  const { module, entity } = await params;
  const config = ENTITIES_BY_KEY[entity];
  if (!config || config.module !== module) notFound();

  // Pass only the key across the server→client boundary; EntityManager
  // resolves the full config (which contains functions) on the client.
  return <EntityManager entityKey={entity} />;
}
