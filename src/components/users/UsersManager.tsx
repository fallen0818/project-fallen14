"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "viewer" | "editor";
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * Editor-only roster for promoting a viewer to editor (or demoting one back)
 * -- see the page.tsx this backs for why the gate lives one level up too.
 * Every row is editable since profiles_update_by_editor (migration 0033)
 * lets an editor update anyone's role, not just their own.
 */
export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const showToast = useToast();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, role")
          .order("email");
        if (error) throw error;
        setProfiles((data ?? []) as ProfileRow[]);
      } catch (err) {
        showToast(errorMessage(err), "error");
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  async function changeRole(row: ProfileRow, nextRole: "viewer" | "editor") {
    if (nextRole === row.role) return;
    if (row.id === currentUserId) {
      const warning =
        nextRole === "viewer"
          ? "Change your own role to Viewer? You'll lose edit access immediately, including on this page."
          : "Change your own role to Editor?";
      if (!confirm(warning)) return;
    }
    setSavingId(row.id);
    const prevRole = row.role;
    setProfiles((prev) => prev.map((p) => (p.id === row.id ? { ...p, role: nextRole } : p)));
    try {
      const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", row.id);
      if (error) throw error;
      showToast(`${row.email ?? "User"} is now ${nextRole === "editor" ? "an Editor" : "a Viewer"}`, "success");
    } catch (err) {
      setProfiles((prev) => prev.map((p) => (p.id === row.id ? { ...p, role: prevRole } : p)));
      showToast(errorMessage(err), "error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PageHeader breadcrumb="Settings" title="Users" />

      <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)", marginBottom: "1rem" }}>
        Viewers can see every record but can&apos;t create, edit, delete, or mark anything. Editors have full read/write
        access everywhere, including this page.
      </p>

      {loading ? (
        <p style={{ color: "var(--on-surface-variant)" }}>Loading…</p>
      ) : profiles.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--on-surface-variant)" }}>
          No users yet.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <th className="label-sm" style={{ textAlign: "left", padding: "0.85rem 1rem" }}>Email</th>
                <th className="label-sm" style={{ textAlign: "left", padding: "0.85rem 1rem" }}>Name</th>
                <th className="label-sm" style={{ textAlign: "left", padding: "0.85rem 1rem" }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--surface-container-high)" }}>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {p.email ?? "—"}
                    {p.id === currentUserId && (
                      <span className="label-sm" style={{ marginLeft: "0.5rem", textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
                        (you)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{p.full_name || "—"}</td>
                  <td style={{ padding: "0.6rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <select
                        className="select"
                        style={{ width: "auto", minWidth: 120 }}
                        value={p.role}
                        disabled={savingId === p.id}
                        onChange={(e) => changeRole(p, e.target.value as "viewer" | "editor")}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <Badge value={p.role} label={p.role === "editor" ? "Editor" : "Viewer"} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
