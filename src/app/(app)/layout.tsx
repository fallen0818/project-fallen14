import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { RoleProvider, type UserRole } from "@/lib/auth/role-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: middleware also guards these routes.
  if (!user) redirect("/login");

  // Drives which write controls the UI shows -- the real enforcement is RLS
  // (migration 0033), so a stale/missing profile row just means a more
  // restrictive UI, never a more permissive one.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role: UserRole = profile?.role === "editor" ? "editor" : "viewer";

  return (
    <RoleProvider role={role}>
      <div className="app-shell">
        <Sidebar email={user.email ?? "user@example.com"} role={role} />
        <main className="app-main">{children}</main>
      </div>
    </RoleProvider>
  );
}
