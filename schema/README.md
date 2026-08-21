# Capex → Procurement → Project Monitoring Schemas

JSON Schema (draft 2020-12) definitions for the capital-investment lifecycle, generated directly from the **live Supabase schema** (project `wesm`, `supabase/migrations/` 0001–0051) rather than hand-designed. If this file and the live database ever disagree again, the database wins — re-derive this directory from it, don't patch around the difference.

## Why this directory was regenerated

The previous version of `schema/` predated a series of live restructures documented in `supabase/SCHEMA_RESTRUCTURE.md`: vendor identity was normalized into real `vendors`/`contractors` tables, `status`/`category`/`priority` columns became generic `lookup_options` references, the RFQ/Vendor-Bidding module was retired in favor of `procurement_activities`, and Bill of Materials / Post-Qualification were added as new modules. The old schemas described a shape the database no longer has (e.g. a `vendor-bidding.schema.json` for a table that's been dropped). This version matches `supabase/migrations/` as of migration 0051, verified table-by-table against the live project via the Supabase MCP connection, not reconstructed from memory.

**Cleanup needed:** two files from the previous version are now obsolete and should be deleted — `schema/procurement-plan/common.schema.json` (superseded by the root-level `common.schema.json` below) and `schema/procurement-plan/vendor-bidding.schema.json` (the table it described, `vendor_biddings`, was dropped in migration 0041). This tool can't delete files on your machine directly; delete both by hand once you've glanced at them.

## Structure

```
schema/
├── common.schema.json          # Shared $defs: uuid, money, currency, date/timestamp, bounded text
├── capex-plan/
│   ├── capex-budget.schema.json
│   ├── approval-matrix.schema.json     # + embedded approval_matrix_levels
│   ├── asset-request.schema.json       # + embedded asset_request_approvals
│   └── bill-of-materials.schema.json   # + embedded bill_of_materials_lines
├── procurement-plan/
│   ├── procurement-item.schema.json
│   ├── purchase-requisition.schema.json
│   ├── procurement-activity.schema.json    # + embedded procurement_activity_lines
│   ├── vendor-bid.schema.json
│   ├── rfq-document-checklist.schema.json
│   ├── rfq-checklist-result.schema.json
│   ├── post-qualification.schema.json      # + embedded post_qualification_checklist
│   └── purchase-order.schema.json          # + embedded purchase_order_lines
├── project-monitoring/
│   ├── project-charter.schema.json     # + embedded project_charter_objectives, funding link array
│   ├── milestone.schema.json           # + embedded milestone_deliverables, dependency link array
│   ├── financial-tracking.schema.json  # + linked-PO link array
│   └── risk-issue-log.schema.json
├── reference-data/                     # Cross-module shared data, not owned by one lifecycle stage
│   ├── vendor.schema.json
│   ├── contractor.schema.json
│   ├── lookup-option.schema.json       # The generic status/category/priority/mode reference-data table
│   └── profile.schema.json
├── examples/
│   └── lifecycle-example.json          # One linked instance across all 20 schemas
└── validate.mjs                        # Ajv validation runner
```

20 schema files for 31 live tables: the difference is 11 pure single-owner child tables (`approval_matrix_levels`, `asset_request_approvals`, `bill_of_materials_lines`, `procurement_activity_lines`, `post_qualification_checklist`, `purchase_order_lines`, `project_charter_objectives`, `milestone_deliverables`) embedded as arrays in their parent's schema rather than given their own file, plus two pure many-to-many join tables (`project_charter_funding`, `financial_tracking_pos`) and one self-referential one (`milestone_dependencies`) surfaced as plain arrays of linked IDs on the owning side rather than as standalone objects — none of these carry any data beyond the link itself.

## How entities relate

```
capex-budget ──< asset-request ──< bill-of-materials ──< procurement-item ──< purchase-requisition
                       │                                        │                     │
                       │                                        │                     └──< procurement-activity ──< vendor-bid, rfq-document-checklist ──< rfq-checklist-result
                       │                                        │                                    │
                       │                                        │                                    └──< post-qualification ──> purchase-order
project-charter ───────┘ (funding link -> procurement-item)                                                                          │
     ├──< milestone                                                                                                                    │
     ├──< financial-tracking >──── linked-PO array ─────────────────────────────────────────────────────────────────────────────────┘
     └──< risk-issue-log (may link a milestone)

vendor / contractor -- shared reference data, referenced from procurement-item (preferred), vendor-bid,
                        post-qualification, and purchase-order. Mutual exclusivity (a bid/PO is sourced
                        from a vendor OR a contractor, never both) is a DB check constraint, mirrored in
                        each schema as a top-level `not: { required: [...] }`.

lookup-option -- the generic status/category/priority/mode reference-data table. Every `*Id` field whose
                 description says "FK -> lookup_options.id, list_key = X" draws its valid values from
                 lookup-option rows at that list_key, not from a fixed schema-level enum. See
                 reference-data/lookup-option.schema.json for the current list of list_keys in use.
```

## ID conventions

| Entity | Pattern | Example |
|---|---|---|
| Capex budget | `CBUD-YYYY-####` | `CBUD-2026-0001` |
| Approval matrix | `APPX-####` | `APPX-0001` |
| Asset request | `CAPEX-######` | `CAPEX-000042` |
| Bill of materials | `BOM-######` | `BOM-000001` |
| Procurement item | `PRC-ITEM-######` | `PRC-ITEM-000101` |
| Purchase requisition | `PR-######` | `PR-000501` |
| Procurement activity | `PRC-ACT-######` | `PRC-ACT-000001` |
| Post-qualification | `PRC-PQ-######` | `PRC-PQ-000001` |
| Purchase order | `PO-######` | `PO-000900` |
| Project charter | `PRJ-######` | `PRJ-000010` |
| Milestone | `MS-######` | `MS-000031` |
| Financial tracking | `FT-######` | `FT-000205` |
| Risk / issue | `RISK-######` / `ISSUE-######` | `RISK-000012` |

Vendor, Contractor, Lookup Option, and Profile have no human-readable code — plain UUID primary keys, matched to what's actually live.

## Shared conventions

- **Money** — non-negative `number`, capped at 1,000,000,000 as a sanity bound. Currency travels as a bare `^[A-Z]{3}$` pattern, matching the DB's own check constraint exactly — not a curated ISO-4217 enum, since the live system doesn't enforce one either.
- **Dates** — `format: "date"` (`YYYY-MM-DD`); timestamps use `format: "date-time"`.
- **Closed objects** — every schema sets `additionalProperties: false`.
- **Status/category/priority/mode fields** — a `lookupRef` (`{ type: "string", format: "uuid" }`) pointing at `lookup_options.id`, filtered by `list_key` in the field's own `description`. This replaced fixed schema-level enums when the live database moved to the generic `lookup_options` system (migrations 0008–0011) — valid values are runtime data now, editable by any authenticated user, not something this schema set can pin down statically.
- **Vendor/Contractor exclusivity** — anywhere a record is sourced from a Supplier or a Contractor (`vendor-bid`, `post-qualification`, `purchase-order`), the schema carries `"not": { "required": ["vendorId", "contractorId"] }` mirroring the DB's own check constraint.
- **Bounded text** — every string field carries a `maxLength` (via `common.schema.json`'s `nonEmptyText`/`longText`/`optionalText`, or set inline).

## Validating

```bash
cd schema
npm install
npm run validate
```

`validate.mjs` registers `common.schema.json` first (every module `$ref`s it via `../common.schema.json#/$defs/...`), compiles all 20 schemas with Ajv (2020-12 + formats), and checks the bundled `examples/lifecycle-example.json` — one linked instance per entity — against each. All schemas and the example currently pass.
