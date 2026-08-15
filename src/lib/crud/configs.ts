import type { EntityConfig } from "./types";
import { nextSequentialCode } from "./service";

type Ref = Record<string, unknown>;

const CURRENCY_HELP = "ISO 4217 code, e.g. PHP";

const codeLabel = (r: Ref) => String(r.code ?? r.id);
const codeTitleLabel = (r: Ref) =>
  `${r.code ?? ""}${r.title ? " · " + String(r.title) : r.name ? " · " + String(r.name) : ""}`;
/** Display label for a procurement_items row: code + description (it has no title/name column). */
const codeDescriptionLabel = (r: Ref) =>
  `${r.code ?? ""}${r.description ? " · " + String(r.description) : ""}`;
const nameLabel = (r: Ref) => String(r.name ?? r.id);
/** Display label for a lookup_options row: its human-readable value. */
const lookupLabel = (r: Ref) => String(r.value ?? r.id);
/**
 * Shorthand for a reference field backed by `lookup_options`, filtered to one
 * list_key (e.g. "procurement_item_status"). These replaced hardcoded
 * type:"select" enums after migrations 0008-0011 moved status/category/
 * priority off plain text columns onto *_id foreign keys.
 */
function lookupRef(listKey: string) {
  return {
    refTable: "lookup_options",
    refFilter: { column: "list_key", value: listKey },
    refLabel: lookupLabel,
  } as const;
}

export const ENTITIES: EntityConfig[] = [
  // =========================================================================
  // CAPEX PLAN
  // =========================================================================
  {
    key: "budgets",
    table: "capex_budgets",
    singular: "Budget",
    plural: "Capex Budgets",
    module: "capex",
    breadcrumb: "Capex Plan",
    primaryField: "code",
    makeCode: (sb, v) => nextSequentialCode(sb, "capex_budgets", `CBUD-${v.fiscal_year ?? new Date().getFullYear()}-`, 4),
    fields: [
      { name: "fiscal_year", label: "Fiscal Year", type: "number", required: true, inList: true },
      { name: "period_id", label: "Period", type: "reference", ...lookupRef("budget_period"), required: true, inList: true },
      { name: "department", label: "Department", type: "text", required: true, inList: true },
      { name: "category_id", label: "Category", type: "reference", ...lookupRef("asset_category"), inList: true },
      { name: "allocated_amount", label: "Allocated", type: "currency", required: true, inList: true },
      // DB columns are `not null default 0` -- optional in the form, but if
      // left blank, clean() (service.ts) turns "" into an explicit null,
      // which violates the not-null constraint (unlike the required fields
      // above, these have no built-in guard against a blank submit). Default
      // to 0 here so a fresh Budget always submits a real number, matching
      // what the DB would have used anyway.
      { name: "committed_amount", label: "Committed", type: "currency", defaultValue: 0 },
      { name: "spent_amount", label: "Spent", type: "currency", defaultValue: 0 },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("budget_status"), required: true, inList: true, badge: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "approval-matrices",
    table: "approval_matrices",
    singular: "Approval Matrix",
    plural: "Approval Matrices",
    module: "capex",
    breadcrumb: "Capex Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "approval_matrices", "APPX-", 4),
    fields: [
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP, inList: true },
      { name: "effective_from", label: "Effective From", type: "date", required: true, inList: true },
      { name: "effective_to", label: "Effective To", type: "date" },
    ],
  },
  {
    key: "asset-requests",
    table: "asset_requests",
    singular: "Asset Request",
    plural: "Asset Requests",
    module: "capex",
    breadcrumb: "Capex Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "asset_requests", "CAPEX-", 6),
    fields: [
      { name: "budget_id", label: "Budget", type: "reference", refTable: "capex_budgets", refLabel: codeLabel, required: true, inList: true },
      { name: "title", label: "Title", type: "text", required: true, inList: true },
      { name: "description", label: "Description", type: "textarea" },
      // No Category field here -- an Asset Request already belongs to
      // exactly one Budget (budget_id, above), and that Budget carries its
      // own Category (see "budgets" -> category_id, same asset_category
      // list). A second, independently-set Category on the request itself
      // just duplicated that taxonomy; dropped in migration 0023 along with
      // the asset_category_id column.
      // Set by hand at request time; once a Bill of Materials is linked
      // (see the "bom" entity below), its auto-computed Estimated Total
      // overwrites this field every time the parts list changes (migration
      // 0034) -- editing it here still works, but only until the BOM's
      // total next recomputes.
      { name: "estimated_cost", label: "Estimated Cost", type: "currency", required: true, inList: true, help: "Auto-follows the linked Bill of Materials' Estimated Total once one exists" },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "funding_source_id", label: "Funding Source", type: "reference", ...lookupRef("funding_source"), inList: true },
      { name: "justification", label: "Justification", type: "textarea" },
      { name: "priority_id", label: "Priority", type: "reference", ...lookupRef("asset_request_priority"), inList: true, badge: true },
      { name: "requested_by", label: "Requested By", type: "text", required: true },
      { name: "request_date", label: "Request Date", type: "date", required: true },
      { name: "required_by_date", label: "Required By", type: "date" },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("asset_request_status"), required: true, inList: true, badge: true },
    ],
  },
  {
    key: "bom",
    table: "bill_of_materials",
    singular: "Bill of Materials",
    plural: "Bills of Materials",
    module: "capex",
    breadcrumb: "Capex Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "bill_of_materials", "BOM-", 6),
    fields: [
      { name: "asset_request_id", label: "Asset Request", type: "reference", refTable: "asset_requests", refLabel: codeTitleLabel, required: true, inList: true, help: "One BOM per asset request" },
      // Not required -- the linked Asset Request above already carries its
      // own title, so this one is just an optional override/label for the
      // BOM itself. DB column made nullable to match (migration 0024).
      { name: "title", label: "Title", type: "text", inList: true },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("bom_status"), required: true, inList: true, badge: true },
      { name: "prepared_by", label: "Prepared By", type: "text" },
      // Trigger-maintained sum of the parts list's Extended Cost (migration
      // 0025) -- same idea as project_charters.overall_progress_percent
      // (0022): a cross-table aggregate can't be a generated column, so it's
      // kept in sync by a trigger on bill_of_materials_lines instead. inList
      // here is what actually answers "show it upfront" -- the parts list's
      // own footer total (configs.ts's lineItems.totalField, still set
      // below) only surfaces once a BOM is already open for editing.
      { name: "estimated_total_cost", label: "Estimated Total", type: "currency", readOnly: true, inList: true, help: "Auto-computed: sum of the parts list's Extended Cost" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    // The flat parts list (engineering/spec layer). Each saved line can be
    // turned into a real Procurement Item — see convertTo below — which
    // then goes through the existing RFQ/PO flow like any other item.
    lineItems: {
      table: "bill_of_materials_lines",
      parentColumn: "bom_id",
      label: "Materials / Parts List",
      addLabel: "+ Add Part",
      fields: [
        { name: "part_name", label: "Part / Material", type: "text", required: true, placeholder: "e.g. 24-port Gigabit Switch" },
        { name: "part_number", label: "Part No.", type: "text" },
        { name: "category_id", label: "Category", type: "reference", ...lookupRef("procurement_category"), required: true },
        { name: "quantity", label: "Qty", type: "number", required: true },
        { name: "unit_of_measure", label: "Unit", type: "text", required: true, placeholder: "each" },
        { name: "estimated_unit_cost", label: "Unit Cost", type: "currency", help: "Optional at this stage — refined during sourcing" },
        // DB-generated (quantity * estimated_unit_cost, migration 0019) --
        // readOnly so it's never written, `compute` gives a live preview
        // while editing instead of waiting for the real generated value to
        // come back from a save.
        {
          name: "estimated_total_cost",
          label: "Extended Cost",
          type: "currency",
          readOnly: true,
          compute: (line) => Number(line.quantity || 0) * Number(line.estimated_unit_cost || 0),
          help: "Qty × Unit Cost",
        },
      ],
      emptyLine: () => ({ part_name: "", part_number: "", category_id: "", quantity: "", unit_of_measure: "", estimated_unit_cost: "" }),
      totalField: "estimated_total_cost",
      totalLabel: "Estimated Total",
      convertTo: {
        entityKey: "items",
        linkColumn: "procurement_item_id",
        buttonLabel: "Generate Procurement Items from Parts List",
        mapLine: async (line, parent, supabase) => {
          // procurement_item_status is a lookup_options id, generated per
          // environment — can't hardcode it, so resolve the first status by
          // code ("Identified", PIST-0001) as the sensible default for a
          // just-created item.
          const { data: status } = await supabase
            .from("lookup_options")
            .select("id")
            .eq("list_key", "procurement_item_status")
            .order("code")
            .limit(1)
            .single();
          const partNumber = line.part_number ? String(line.part_number) : "";
          return {
            capex_request_id: parent.asset_request_id,
            description: partNumber ? `${line.part_name} (${partNumber})` : line.part_name,
            category_id: line.category_id,
            quantity: line.quantity,
            unit_of_measure: line.unit_of_measure,
            estimated_unit_cost: line.estimated_unit_cost || 0,
            currency: "PHP",
            status_id: status?.id,
          };
        },
      },
    },
  },

  // =========================================================================
  // PROCUREMENT PLAN
  // =========================================================================
  {
    key: "items",
    table: "procurement_items",
    singular: "Procurement Item",
    plural: "Procurement Items",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "procurement_items", "PRC-ITEM-", 6),
    fields: [
      { name: "capex_request_id", label: "Capex Request", type: "reference", refTable: "asset_requests", refLabel: codeTitleLabel, required: true, inList: true },
      { name: "description", label: "Description", type: "text", required: true, inList: true },
      { name: "category_id", label: "Category", type: "reference", ...lookupRef("procurement_category"), required: true, inList: true },
      { name: "quantity", label: "Quantity", type: "number", required: true, inList: true },
      { name: "unit_of_measure", label: "Unit", type: "text", required: true, placeholder: "each" },
      { name: "estimated_unit_cost", label: "Unit Cost", type: "currency", required: true },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "estimated_total_cost", label: "Total Cost", type: "currency", inList: true, readOnly: true, help: "Quantity × Unit Cost" },
      { name: "preferred_vendor_id", label: "Preferred Supplier", type: "reference", refTable: "vendors", refLabel: nameLabel, help: "Set a supplier or a contractor, not both" },
      { name: "preferred_contractor_id", label: "Preferred Contractor", type: "reference", refTable: "contractors", refLabel: nameLabel },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("procurement_item_status"), required: true, inList: true, badge: true },
    ],
  },
  {
    key: "vendors",
    table: "vendors",
    singular: "Supplier",
    plural: "Suppliers",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "name",
    noOwner: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "is_active", label: "Active", type: "boolean", defaultValue: true, inList: true },
      { name: "tax_id", label: "Tax ID (TIN)", type: "text" },
      { name: "address", label: "Address", type: "text" },
      { name: "website", label: "Website", type: "text", placeholder: "https://" },
      { name: "contact_name", label: "Contact Name", type: "text", inList: true },
      { name: "contact_email", label: "Contact Email", type: "text" },
      { name: "contact_phone", label: "Contact Phone", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "contractors",
    table: "contractors",
    singular: "Contractor",
    plural: "Contractors",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "name",
    noOwner: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "is_active", label: "Active", type: "boolean", defaultValue: true, inList: true },
      { name: "specialty_id", label: "Specialty", type: "reference", ...lookupRef("contractor_specialty"), inList: true, badge: true },
      { name: "license_category_id", label: "License Category", type: "reference", ...lookupRef("contractor_license_category"), inList: true, badge: true, help: "PCAB classification, AAA (largest) down to Trade" },
      { name: "license_number", label: "License Number", type: "text", inList: true },
      { name: "license_expiry_date", label: "License Expiry", type: "date" },
      { name: "insurance_expiry", label: "Insurance Expiry", type: "date" },
      { name: "tax_id", label: "Tax ID (TIN)", type: "text" },
      { name: "address", label: "Address", type: "text" },
      { name: "website", label: "Website", type: "text", placeholder: "https://" },
      { name: "contact_name", label: "Contact Name", type: "text", inList: true },
      { name: "contact_email", label: "Contact Email", type: "text" },
      { name: "contact_phone", label: "Contact Phone", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "requisitions",
    table: "purchase_requisitions",
    singular: "Requisition",
    plural: "Purchase Requisitions",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "purchase_requisitions", "PR-", 6),
    fields: [
      { name: "title", label: "Title", type: "text", inList: true },
      { name: "requested_by", label: "Requested By", type: "text", required: true, inList: true },
      { name: "department", label: "Department", type: "text", required: true, inList: true },
      { name: "requisition_date", label: "Requisition Date", type: "date", required: true },
      { name: "required_by_date", label: "Required By", type: "date" },
      // Not trigger-linked to the line items below -- unlike bom's
      // estimated_total_cost (migration 0025), this one stays a manually
      // entered planning figure. The line items' own footer total (below)
      // is a separate, itemized cross-check once items are actually attached.
      { name: "estimated_total", label: "Estimated Total", type: "currency", inList: true },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("requisition_status"), required: true, inList: true, badge: true },
      { name: "approved_by", label: "Approved By", type: "text" },
    ],
    // The actual link from a requisition to the procurement items it covers
    // -- purchase_requisition_lines already existed live (migration 0001)
    // with full owner-scoped RLS (prl_write) but had no frontend anywhere,
    // so a requisition could never actually be tied to an item. This is also
    // what the Bid Evaluation matrix's per-item pricing (see /bid-evaluation)
    // reads from: RFQ -> requisition -> these lines -> procurement_items.
    lineItems: {
      table: "purchase_requisition_lines",
      parentColumn: "requisition_id",
      label: "Procurement Items",
      addLabel: "+ Add Item",
      fields: [
        { name: "procurement_item_id", label: "Procurement Item", type: "reference", refTable: "procurement_items", refLabel: codeDescriptionLabel, required: true },
        { name: "quantity", label: "Qty", type: "number", required: true },
        { name: "estimated_unit_cost", label: "Unit Cost", type: "currency", help: "Optional -- defaults to the item's own estimated unit cost if left blank during sourcing" },
        {
          name: "line_total",
          label: "Extended Cost",
          type: "currency",
          readOnly: true,
          compute: (line) => Number(line.quantity || 0) * Number(line.estimated_unit_cost || 0),
          help: "Qty × Unit Cost (not stored -- computed for display only)",
        },
        { name: "notes", label: "Notes", type: "text" },
      ],
      emptyLine: () => ({ procurement_item_id: "", quantity: "", estimated_unit_cost: "", notes: "" }),
      totalField: "line_total",
      totalLabel: "Items Total",
    },
  },
  {
    key: "rfqs",
    table: "vendor_biddings",
    singular: "RFQ",
    plural: "Vendor Bidding (RFQs)",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "vendor_biddings", "RFQ-", 6),
    fields: [
      { name: "requisition_id", label: "Requisition", type: "reference", refTable: "purchase_requisitions", refLabel: codeLabel, required: true, inList: true },
      { name: "title", label: "Title", type: "text", inList: true },
      { name: "issue_date", label: "Issue Date", type: "date", required: true, inList: true },
      { name: "close_date", label: "Close Date", type: "date", required: true },
      { name: "currency", label: "Currency", type: "text", placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("rfq_status"), required: true, inList: true, badge: true },
      { name: "awarded_vendor_id", label: "Awarded Supplier", type: "reference", refTable: "vendors", refLabel: nameLabel, help: "Must already have a bid on this RFQ. Award a supplier or a contractor, not both." },
      { name: "awarded_contractor_id", label: "Awarded Contractor", type: "reference", refTable: "contractors", refLabel: nameLabel },
    ],
    // Bidding schedule: Pre-bid Conference, Opening of Bids, Post-qualification,
    // Award, ... each with its own planned date and status. Originally lived
    // per Procurement Item (migration 0007), but the schedule is really one
    // shared event per RFQ -- every item bundled into the same RFQ goes
    // through the same Opening of Bids, not a separate one each -- so it was
    // re-keyed to the RFQ itself (migration 0031), same reasoning as why the
    // Bid Evaluation matrix (see /bid-evaluation) is anchored to the RFQ
    // rather than to individual items.
    lineItems: {
      table: "bidding_schedule_activities",
      parentColumn: "bidding_id",
      label: "Bidding Schedule Activities",
      addLabel: "+ Add Activity",
      fields: [
        { name: "activity", label: "Activity", type: "text", required: true, placeholder: "e.g. Pre-bid Conference, Opening of Bids" },
        { name: "planned_date", label: "Planned Date", type: "date", required: true },
        { name: "status_id", label: "Status", type: "reference", ...lookupRef("bidding_activity_status"), required: true },
      ],
      emptyLine: () => ({ activity: "", planned_date: "", status_id: "" }),
    },
  },
  {
    // Standalone module for the required-documents *template* per RFQ --
    // which documents bidders must submit, grouped by section (see the
    // bid-evaluation matrix at /bid-evaluation for the actual per-bidder
    // Pass/Fail grid, bid offers, and bid security -- this page just manages
    // the list of required documents each RFQ needs). No owner_id column on
    // this table -- writes are gated by owns_rfq() via the parent RFQ
    // instead, see supabase/migrations/0020_rfq_document_checklist.sql and
    // 0021_bid_evaluation_matrix.sql.
    key: "rfq-checklist",
    table: "rfq_document_checklist",
    singular: "Bid Document Checklist Item",
    plural: "Bid Documents Checklist",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "document_name",
    noOwner: true,
    fields: [
      { name: "bidding_id", label: "RFQ", type: "reference", refTable: "vendor_biddings", refLabel: codeTitleLabel, required: true, inList: true },
      { name: "section", label: "Section", type: "text", required: true, placeholder: "e.g. Administrative, Technical, Legal, Financial", inList: true },
      { name: "document_name", label: "Document Name", type: "text", required: true, placeholder: "e.g. Bid Bond", inList: true },
      { name: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    key: "purchase-orders",
    table: "purchase_orders",
    singular: "Purchase Order",
    plural: "Purchase Orders",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "purchase_orders", "PO-", 6),
    fields: [
      { name: "rfq_id", label: "Source RFQ", type: "reference", refTable: "vendor_biddings", refLabel: codeLabel },
      { name: "requisition_id", label: "Requisition", type: "reference", refTable: "purchase_requisitions", refLabel: codeLabel },
      { name: "vendor_id", label: "Supplier", type: "reference", refTable: "vendors", refLabel: nameLabel, inList: true, help: "Set a supplier or a contractor, not both" },
      { name: "contractor_id", label: "Contractor", type: "reference", refTable: "contractors", refLabel: nameLabel, inList: true },
      { name: "order_date", label: "Order Date", type: "date", required: true, inList: true },
      // The formal go-ahead after the PO/contract is signed, authorizing the
      // supplier/contractor to start delivery or mobilization (migration
      // 0030). Tracked as a real date -- not just the "Notice to Proceed"
      // status value below -- since contract duration and delay tracking are
      // usually counted from the date NTP was received, same reasoning as
      // order_date/expected_delivery_date already being real dates.
      { name: "ntp_date", label: "Notice to Proceed Date", type: "date", help: "Date the supplier/contractor was authorized to start — contract duration is often counted from here" },
      { name: "expected_delivery_date", label: "Expected Delivery", type: "date" },
      { name: "subtotal", label: "Subtotal", type: "currency" },
      { name: "tax_amount", label: "Tax", type: "currency" },
      { name: "shipping_amount", label: "Shipping", type: "currency" },
      { name: "total", label: "Total", type: "currency", required: true, inList: true },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "payment_terms", label: "Payment Terms", type: "text", placeholder: "net-30" },
      { name: "delivery_terms", label: "Delivery Terms", type: "text", placeholder: "DDP" },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("purchase_order_status"), required: true, inList: true, badge: true },
    ],
  },

  // =========================================================================
  // PROJECT MONITORING
  // =========================================================================
  {
    key: "charters",
    table: "project_charters",
    singular: "Project Charter",
    plural: "Project Charters",
    module: "monitoring",
    breadcrumb: "Project Monitoring",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "project_charters", "PRJ-", 6),
    fields: [
      { name: "title", label: "Title", type: "text", required: true, inList: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "sponsor", label: "Sponsor", type: "text", required: true, inList: true },
      { name: "project_manager", label: "Project Manager", type: "text", required: true, inList: true },
      { name: "charter_version", label: "Version", type: "number" },
      { name: "start_date", label: "Start Date", type: "date", required: true },
      { name: "planned_end_date", label: "Planned End", type: "date", required: true },
      { name: "baseline_budget", label: "Baseline Budget", type: "currency", required: true, inList: true },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("project_status"), required: true, inList: true, badge: true },
      // Auto-computed by a trigger on milestones (migration 0022) -- the
      // share of this project's Milestones ("subtasks") marked Completed.
      // Never set by hand: recalculates itself whenever a milestone is
      // added, edited, or removed.
      { name: "overall_progress_percent", label: "Overall Progress %", type: "number", readOnly: true, inList: true, help: "Auto-computed: completed milestones ÷ total milestones for this project" },
    ],
  },
  {
    key: "milestones",
    table: "milestones",
    singular: "Milestone",
    plural: "Milestones",
    module: "monitoring",
    breadcrumb: "Project Monitoring",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "milestones", "MS-", 6),
    fields: [
      { name: "project_id", label: "Project", type: "reference", refTable: "project_charters", refLabel: codeTitleLabel, required: true, inList: true },
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "weight", label: "Weight (0-1)", type: "number", min: 0, max: 1, help: "Not currently used by the auto-computed project progress (that's count-based -- see the Project Charter's Overall Progress %); kept for future weighted-progress use." },
      { name: "planned_start", label: "Planned Start", type: "date", required: true },
      { name: "planned_end", label: "Planned End", type: "date", required: true },
      { name: "actual_start", label: "Actual Start", type: "date" },
      { name: "actual_end", label: "Actual End", type: "date" },
      { name: "physical_progress_percent", label: "Progress %", type: "number", min: 0, max: 100, required: true, inList: true },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("milestone_status"), required: true, inList: true, badge: true, help: "Marking this Completed is what counts toward the project's Overall Progress %" },
    ],
  },
  {
    key: "financial-tracking",
    table: "financial_tracking",
    singular: "Financial Record",
    plural: "Financial Tracking",
    module: "monitoring",
    breadcrumb: "Project Monitoring",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "financial_tracking", "FT-", 6),
    fields: [
      { name: "project_id", label: "Project", type: "reference", refTable: "project_charters", refLabel: codeTitleLabel, required: true, inList: true },
      { name: "period", label: "Period", type: "text", required: true, inList: true, placeholder: "2026-03 or 2026-Q1", help: "YYYY-MM or YYYY-Qn" },
      { name: "currency", label: "Currency", type: "text", required: true, placeholder: "PHP", defaultValue: "PHP", help: CURRENCY_HELP },
      { name: "planned_cost", label: "Planned", type: "currency", required: true, inList: true },
      { name: "committed_cost", label: "Committed", type: "currency", required: true, inList: true },
      { name: "actual_cost", label: "Actual", type: "currency", required: true, inList: true },
      { name: "earned_value", label: "Earned Value", type: "currency" },
      { name: "forecast_at_completion", label: "Forecast (EAC)", type: "currency" },
      { name: "cost_variance", label: "Cost Variance", type: "currency", readOnly: true, help: "Earned Value − Actual Cost" },
      { name: "recorded_by", label: "Recorded By", type: "text" },
    ],
  },
  {
    key: "risks",
    table: "risk_issue_log",
    singular: "Risk / Issue",
    plural: "Risk & Issue Log",
    module: "monitoring",
    breadcrumb: "Project Monitoring",
    primaryField: "code",
    // Risk vs. Issue picks the code prefix, but type is now a lookup_options
    // reference (type_id), not a plain "risk"/"issue" string -- resolve the
    // selected option's label before deciding the prefix.
    makeCode: async (sb, v) => {
      let prefix = "RISK-";
      if (v.type_id) {
        const { data } = await sb.from("lookup_options").select("value").eq("id", v.type_id as string).single();
        if (data?.value === "Issue") prefix = "ISSUE-";
      }
      return nextSequentialCode(sb, "risk_issue_log", prefix, 6);
    },
    fields: [
      { name: "project_id", label: "Project", type: "reference", refTable: "project_charters", refLabel: codeTitleLabel, required: true, inList: true },
      { name: "type_id", label: "Type", type: "reference", ...lookupRef("risk_type"), required: true, inList: true, badge: true },
      { name: "title", label: "Title", type: "text", required: true, inList: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category_id", label: "Category", type: "reference", ...lookupRef("risk_category") },
      { name: "probability_id", label: "Probability", type: "reference", ...lookupRef("risk_probability") },
      { name: "impact_id", label: "Impact", type: "reference", ...lookupRef("risk_impact") },
      { name: "severity_id", label: "Severity", type: "reference", ...lookupRef("risk_severity"), inList: true, badge: true },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("risk_status"), required: true, inList: true, badge: true },
      { name: "owner", label: "Owner", type: "text" },
      { name: "mitigation_plan", label: "Mitigation Plan", type: "textarea" },
      { name: "contingency_plan", label: "Contingency Plan", type: "textarea" },
      { name: "raised_date", label: "Raised Date", type: "date", required: true },
      { name: "due_date", label: "Due Date", type: "date" },
      { name: "resolved_date", label: "Resolved Date", type: "date" },
    ],
  },
];

export const ENTITIES_BY_KEY: Record<string, EntityConfig> = Object.fromEntries(
  ENTITIES.map((e) => [e.key, e]),
);

export function entitiesForModule(module: EntityConfig["module"]): EntityConfig[] {
  return ENTITIES.filter((e) => e.module === module);
}

export const MODULES = [
  { key: "capex", label: "Capex Plan", icon: "▤" },
  { key: "procurement", label: "Procurement", icon: "▧" },
  { key: "monitoring", label: "Monitoring", icon: "☑" },
] as const;
