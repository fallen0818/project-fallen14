"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES, entitiesForModule } from "@/lib/crud/configs";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "260px",
        flexShrink: 0,
        background: "var(--surface-container-low)",
        minHeight: "100vh",
        padding: "1.5rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ padding: "0 0.5rem" }}>
        <p className="label-sm" style={{ margin: 0 }}>Capex · Procurement · PM</p>
        <h1 className="font-headline" style={{ fontSize: "1.25rem", marginTop: "0.15rem" }}>
          Investment Control
        </h1>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1, overflowY: "auto" }}>
        <NavLink href="/dashboard" label="Overview" active={pathname === "/dashboard"} icon="◈" />
        <NavLink href="/schedule" label="Annual Schedule" active={pathname === "/schedule"} icon="▦" />

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
        <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: 0 }}>{email.split("@")[0]}</p>
        <p className="label-sm" style={{ margin: "0.1rem 0 0.75rem", textTransform: "none", letterSpacing: 0 }}>{email}</p>
        <ThemeToggle />
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", padding: "0.5rem" }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
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
