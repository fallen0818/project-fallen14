# Investment Control — Capex · Procurement · Project Monitoring

A full-stack app for the capital-investment lifecycle: plan capital budgets, source and order against them, then deliver and monitor the resulting projects.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth + RLS) · Tailwind CSS v4.

## Modules

- **Capex Plan** — capex budgets, asset requests, approval matrices.
- **Procurement** — procurement items, purchase requisitions, vendor bidding (RFQs), purchase orders.
- **Project Monitoring** — project charters, milestones, financial tracking, risk & issue log.

All eleven entities share one metadata-driven CRUD engine (`src/lib/crud`), so each list/create/edit/delete screen is generated from a field config rather than hand-written. Records are linked across modules through reference fields (e.g. a procurement item points at its capex asset request; a milestone points at its project charter).

## Project layout

```
src/
├── app/
│   ├── (app)/                 # Authenticated area (sidebar shell)
│   │   ├── dashboard/         # Cross-domain overview KPIs
│   │   └── [module]/[entity]/ # Generated CRUD screen for every entity
│   ├── login/                 # Supabase email/password auth
│   └── auth/signout/          # Sign-out route handler
├── components/
│   ├── crud/                  # EntityManager (list + form engine)
│   ├── layout/                # Sidebar, PageHeader
│   └── ui/                    # Button, Badge, Modal, Toast, StatCard, ProgressBar
├── lib/
│   ├── crud/                  # CRUD types, generic service, entity configs
│   ├── supabase/              # Browser + server clients, auth middleware
│   └── utils.ts, constants.ts
└── types/                     # Shared TypeScript types
supabase/
├── migrations/                 # Source of truth — apply in order (see Setup)
├── drop-all.sql                # Teardown / reset script
└── SCHEMA_RESTRUCTURE.md       # Account of the 2026-08 RLS/vendor restructure
schema/                        # JSON Schema (draft 2020-12) source of the data model
```

## Setup

1. **Create a Supabase project**, then apply the migrations in order: `supabase link --project-ref your-project-ref` followed by `supabase db push` (applies every file in `supabase/migrations/`, 0001 through the latest). To pull a fresh point-in-time `schema.sql` snapshot afterward, run `supabase db dump --schema public -f supabase/schema.sql`.
2. **Configure env** — copy `.env.example` to `.env.local` and set:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```
   (A working `.env.local` is already present from the previous project.)
3. **Install & run:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll be redirected to `/login`. Create an account, then explore the modules from the sidebar.

## Scripts

| Command            | Purpose                                  |
|--------------------|------------------------------------------|
| `npm run dev`      | Start the dev server                     |
| `npm run build`    | Production build                         |
| `npm run start`    | Serve the production build               |
| `npm run typecheck`| `tsc --noEmit`                           |
| `npm run test`     | Unit tests (Vitest)                      |
| `npm run lint`     | ESLint                                   |

## Security model

Row Level Security is the enforcement boundary. Reads require an authenticated session; writes are restricted to the record's owner (`owner_id = auth.uid()`), with child tables gated through their parent's owner via `owns_*()` helper functions. Policies are split per operation (select/insert/update/delete) rather than combined, and `vendors` is a shared reference table (readable/writable by any authenticated user, no owner) rather than owner-scoped. The anon key is safe to expose to the browser because RLS — not key secrecy — protects the data. See `supabase/migrations/` for the full policy set, and `supabase/SCHEMA_RESTRUCTURE.md` for the reasoning behind the current shape.

## Notes

- The database was reset from the earlier 5-table dashboard to this 24+ table model (now 25, with `vendors`). For a clean slate, run `supabase/drop-all.sql` then `supabase db push` to reapply `supabase/migrations/` from scratch.
- Human-readable codes (e.g. `CAPEX-000042`, `PO-000900`) are generated automatically on create.
- Child collections (approval-matrix levels, vendor bids, PO line items, milestone deliverables, charter funding links) exist in the schema and are ready for detail-view editors as a next iteration; the current UI manages the eleven top-level entities and their relationships.
