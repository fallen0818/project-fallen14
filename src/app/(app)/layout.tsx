import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar email={user.email ?? "user@example.com"} />
      <main style={{ flex: 1, padding: "2rem 2.5rem", maxWidth: "1400px" }}>
        {children}
      </main>
    </div>
  );
}
