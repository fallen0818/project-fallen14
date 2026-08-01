# Capex → Procurement → Project Monitoring Schemas

JSON Schema (draft 2020-12) definitions for the full capital-investment lifecycle: planning a capital budget, sourcing and ordering against it, then delivering and monitoring the resulting project.

## Structure

```
schema/
├── capex-plan/
│   ├── capex-budget.schema.json       # Yearly/quarterly budget allocations
│   ├── asset-request.schema.json      # Individual capital expenditure requests
│   └── approval-matrix.schema.json    # Authorization levels & financial thresholds
├── procurement-plan/
│   ├── procurement-item.schema.json   # Sourced goods/services tied to Capex IDs
│   ├── purchase-requisition.schema.json
│   ├── vendor-bidding.schema.json     # RFQs, vendor quotes & evaluation
│   └── purchase-order.schema.json     # Final PO issuance & terms
├── project-monitoring/
│   ├── project-charter.schema.json    # Scope, timeline & baseline budget
│   ├── milestone-tracker.schema.json  # Deliverables & physical progress (%)
│   ├── financial-tracking.schema.json # Planned vs. actual vs. committed cost
│   └── risk-issue-log.schema.json     # Project risks & blocker management
├── examples/
│   └── lifecycle-example.json         # One linked instance across all 11 schemas
└── validate.mjs                       # Ajv validation runner
```

## How the entities relate

```
capex-budget ──< asset-request ──< procurement-item ──< purchase-requisition (line)
                      │                     │                      │
                      │                     │                      └──< vendor-bidding (RFQ) ──> purchase-order
                      │                     └──────────────────────────────────────────────────────┘
                      │                                                                             │
project-charter ──────┘ (funded by asset-request)                                                   │
     ├──< milestone-tracker                                                                          │
     ├──< financial-tracking >──── links committed cost to ────────────────────────────────────────┘
     └──< risk-issue-log (may link a milestone)
```

Referential links are expressed as ID fields whose `pattern` matches the target entity's own ID pattern:

| From (field)                                   | To (entity → ID field)              |
|------------------------------------------------|-------------------------------------|
| `asset-request.budgetId`                       | `capex-budget.budgetId`             |
| `asset-request.approvals[].level`              | `approval-matrix.levels[].level`    |
| `procurement-item.capexRequestId`              | `asset-request.requestId`           |
| `purchase-requisition.lineItems[].procurementItemId` | `procurement-item.itemId`     |
| `vendor-bidding.requisitionId`                 | `purchase-requisition.requisitionId`|
| `vendor-bidding.bids[].lineQuotes[].procurementItemId` | `procurement-item.itemId`   |
| `purchase-order.rfqId`                         | `vendor-bidding.rfqId`              |
| `purchase-order.lineItems[].procurementItemId` | `procurement-item.itemId`           |
| `project-charter.fundingCapexRequestIds[]`     | `asset-request.requestId`           |
| `milestone-tracker.projectId`                  | `project-charter.projectId`         |
| `financial-tracking.projectId`                 | `project-charter.projectId`         |
| `financial-tracking.linkedPurchaseOrderIds[]`  | `purchase-order.poId`               |
| `risk-issue-log.projectId`                     | `project-charter.projectId`         |
| `risk-issue-log.linkedMilestoneId`             | `milestone-tracker.milestoneId`     |

## ID conventions

| Entity               | Pattern                    | Example            |
|----------------------|----------------------------|--------------------|
| Capex budget         | `CBUD-YYYY-####`           | `CBUD-2026-0001`   |
| Asset request        | `CAPEX-######`             | `CAPEX-000042`     |
| Approval matrix      | `APPX-####`                | `APPX-0001`        |
| Procurement item     | `PRC-ITEM-######`          | `PRC-ITEM-000101`  |
| Purchase requisition | `PR-######`                | `PR-000501`        |
| RFQ / vendor bidding | `RFQ-######`               | `RFQ-000777`       |
| Purchase order       | `PO-######`                | `PO-000900`        |
| Project              | `PRJ-######`               | `PRJ-000010`       |
| Milestone            | `MS-######`                | `MS-000031`        |
| Financial tracking   | `FT-######`                | `FT-000205`        |
| Risk / issue         | `RISK-######` / `ISSUE-######` | `RISK-000012`  |

## Shared conventions

- **Money** — non-negative `number`. Amounts always travel with an ISO 4217 `currency` (`^[A-Z]{3}$`).
- **Dates** — `format: "date"` (`YYYY-MM-DD`); timestamps use `format: "date-time"`.
- **Closed objects** — every schema sets `additionalProperties: false` so unknown fields are rejected.
- **Enums** — statuses, categories, priorities and severities are constrained to fixed vocabularies.

## Validating

```bash
cd schema
npm install
npm run validate
```

`validate.mjs` compiles all 11 schemas with Ajv (2020-12 + formats) and checks the bundled `examples/lifecycle-example.json` against each. All schemas and examples currently pass, including a negative test confirming rejection of bad IDs, out-of-range amounts, unknown enums and extra properties.
