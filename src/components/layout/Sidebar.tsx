"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MODULES, entitiesForModule } from "@/lib/crud/configs";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Badge } from "@/components/ui/Badge";
import type { UserRole } from "@/lib/auth/role-context";

export function Sidebar({ email, role }: { email: string; role: UserRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary sidebar-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        ☰ Menu
      </button>

      <div
        className={`sidebar-backdrop${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar${open ? " is-open" : ""}`}>
        <div style={{ padding: "0 0.5rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p className="label-sm" style={{ margin: 0 }}>Capex · Procurement · PM</p>
            <h1 className="font-headline" style={{ fontSize: "1.25rem", marginTop: "0.15rem" }}>
              Investment Control
            </h1>
          </div>
          <button
            type="button"
            className="btn btn-ghost sidebar-toggle"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            style={{ padding: "0.35rem 0.6rem" }}
          >
            ✕
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1, overflowY: "auto" }}>
          <NavLink href="/dashboard" label="Overview" active={pathname === "/dashboard"} icon="◈" />
          <NavLink href="/schedule" label="Annual Schedule" active={pathname === "/schedule"} icon="▦" />
          {role === "editor" && (
            <NavLink href="/users" label="Users" active={pathname === "/users"} icon="◐" />
          )}

          {MODULES.map((m) => (
            <div key={m.key}>
              <p className="label-sm" style={{ margin: "0 0 0.4rem 0.85rem" }}>
                {m.icon} {m.label}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                {entitiesForModule(m.key).map((e) => {
                  const href = `/${m.key}/${e.key}`;
                  return <NavLink key={href} href={href} label={e.plural} active={pathname === href} nested />;
                })}
                {/* Bid Evaluation is a bespoke per-bidder matrix, not a generic
                    config-driven entity, so it isn't picked up by entitiesForModule
                    -- added here by hand, procurement-only. */}
                {m.key === "procurement" && (
                  <NavLink href="/bid-evaluation" label="Bid Evaluation" active={pathname === "/bid-evaluation"} nested />
                )}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ padding: "0 0.5rem", borderTop: "1px solid var(--outline-variant)", paddingTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: 0 }}>{email.split("@")[0]}</p>
            <Badge value={role} label={role === "editor" ? "Editor" : "Viewer"} />
          </div>
          <p className="label-sm" style={{ margin: "0.1rem 0 0.75rem", textTransform: "none", letterSpacing: 0 }}>{email}</p>
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", padding: "0.5rem" }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  label,
  active,
  nested,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  nested?: boolean;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: nested ? "0.45rem 0.85rem 0.45rem 1.5rem" : "0.55rem 0.85rem",
        borderRadius: "0.6rem",
        textDecoration: "none",
        fontSize: nested ? "0.85rem" : "0.9rem",
        fontWeight: active ? 700 : 500,
        color: active ? "var(--primary)" : "var(--on-surface-variant)",
        background: active ? "var(--surface-container-lowest)" : "transparent",
      }}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </Link>
  );
}
