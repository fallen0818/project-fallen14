import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UsersManager } from "@/components/users/UsersManager";

/**
 * Where an editor promotes a viewer (or demotes another editor) -- without
 * this, granting the "editor" role would mean going into the Supabase
 * dashboard directly. Gated to editors here (server-side, before anything
 * renders) and again by RLS on the actual profiles update (migration 0033,
 * profiles_update_by_editor) -- a viewer who guesses the URL gets bounced
 * before the page loads, and even if they somehow reached the component,
 * the database would refuse the write.
 */
export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "editor") redirect("/dashboard");

  return <UsersManager currentUserId={user.id} />;
}
