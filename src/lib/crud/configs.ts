import type { EntityConfig } from "./types";
import { nextSequentialCode } from "./service";

type Ref = Record<string, unknown>;

const CURRENCY_HELP = "ISO 4217 code, e.g. PHP";

const codeLabel = (r: Ref) => String(r.code ?? r.id);
const codeTitleLabel = (r: Ref) =>
  `${r.code ?? ""}${r.title ? " · " + String(r.title) : r.name ? " · " + String(r.name) : ""}`;
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
    // then goes through the existing bid evaluation/PO flow like any other
    // item.
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
        buttonLabel: "Generate Procurement Item from Parts List",
        // procurement_items is one row per Asset Request (migration 0038),
        // and every line on a BOM already shares the same Asset Request --
        // so "Generate" must produce exactly one Procurement Item no matter
        // how many parts are listed, not one per part (that was creating
        // duplicate items, one per line, all pointing at the same request).
        singleTargetPerParent: true,
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
          // Category/Description/Quantity/Unit Cost no longer exist on
          // procurement_items (migration 0038) -- a generated item now
          // carries only its link back to the Asset Request, Unit, and
          // Status; cost arrives on its own via the same request-linked
          // sync trigger every other item's cost goes through.
          return {
            capex_request_id: parent.asset_request_id,
            unit_of_measure: line.unit_of_measure,
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
    // Category, Description, Quantity, and Unit Cost were dropped from this
    // entity (migration 0038) -- an item is one-per-Asset-Request, so the
    // Asset Request's own Title/Description already says what it is, and
    // its Estimated Cost already says what it costs as one flat figure
    // (no separate qty x unit-cost breakdown at this level anymore).
    //
    // Field order below follows the actual process (per the user's own
    // description of it): an approved Asset Request lands here first: pick
    // its Mode of Procurement based on the now-known approved amount (Total
    // Cost, below), *then* decide which Requisition it belongs to (items
    // headed for the same mode are what typically get batched into one
    // Requisition together) -- migration 0048.
    fields: [
      { name: "capex_request_id", label: "Capex Request", type: "reference", refTable: "asset_requests", refLabel: codeTitleLabel, required: true, inList: true },
      // Decided here, not on the Requisition or Activity -- this is the
      // earliest point the approved amount is known (Total Cost, below),
      // and which mode applies is what determines which Requisition this
      // item should even be grouped into (migration 0048).
      { name: "mode_id", label: "Mode of Procurement", type: "reference", ...lookupRef("procurement_mode"), required: true, inList: true, help: "Public Bidding, Simplified, or Shopping — decide based on the approved amount (Total Cost, below)" },
      // Locked to the linked Asset Request's Estimated Cost (migration
      // 0035, retargeted in 0038 from Unit Cost to this field directly) --
      // never independently entered here. Cascades from the BOM -> Asset
      // Request sync (0034), so a parts-list edit flows all the way down.
      // Shown here (ahead of Requisition/Status) since it's what Mode of
      // Procurement above should actually be decided from.
      { name: "estimated_total_cost", label: "Total Cost", type: "currency", inList: true, readOnly: true, help: "Auto-copied from the linked Capex Request's Estimated Cost" },
      // Requisition, Currency, and Unit of Measure were removed from this
      // form by request (migration 0053):
      //  - requisition_id: still app-editable, just from the Purchase
      //    Requisition's own reverseLookup editor instead of duplicated
      //    here (an item can still exist unlinked -- on delete set null).
      //  - currency: every row in practice is already PHP (the form
      //    default, and the only value the BOM-conversion flow ever wrote)
      //    -- migration 0053 gave the column its own DB default so a
      //    create that no longer submits this field still gets a valid,
      //    non-null "PHP".
      //  - unit_of_measure: genuinely varies per item (each/hour/licence/
      //    kg/m/lot) with no single correct default to hide it behind, so
      //    migration 0053 dropped its not-null constraint instead --
      //    new items just have no unit recorded unless set elsewhere.
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("procurement_item_status"), required: true, inList: true, badge: true },
    ],
    // Date of Bidding dropped, and items go back to always being editable
    // and deletable no matter what Status is set to -- the earlier "lock
    // once terminal" behavior (migration 0044, EntityConfig.lockWhenTerminal)
    // was undone by the user's own call (migration 0050); Status itself is
    // unaffected, still a normal editable dropdown/badge.
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
    // Title, Estimated Total, Currency, and the "+ Add Item" Procurement
    // Items line list were all dropped (migration 0046) -- that multi-item
    // list was the only link to Procurement Items at the time, and it was
    // removed by the user's own call. The link exists again now, just from
    // the item's side instead (Procurement Item's own Requisition field,
    // migration 0047) -- one item picks its one requisition, rather than a
    // requisition owning a list of items. That still left Bid Evaluation's
    // old per-item pricing without a home (see BidEvaluationMatrix.tsx).
    //
    // A Requisition's real job is being the approval gate, not a scheduling
    // record (the user's own framing) -- trimmed down accordingly (migration
    // 0049) to just who's asking, the decision, and the decision trail.
    // Requisition Date and Required By were dropped; `created_at` (already
    // shown in the edit modal header) covers "when this was raised" well
    // enough without a duplicate field.
    fields: [
      { name: "requested_by", label: "Requested By", type: "text", required: true, inList: true },
      { name: "department", label: "Department", type: "text", required: true, inList: true },
      { name: "status_id", label: "Status", type: "reference", ...lookupRef("requisition_status"), required: true, inList: true, badge: true },
      { name: "approved_by", label: "Approved By", type: "text", inList: true },
      { name: "approved_date", label: "Approved Date", type: "date" },
    ],
    // Editable from this side too (not just the Procurement Item's own
    // "Requisition" field, migration 0047) -- a dropdown of unlinked items
    // right here, per the user's own ask for a way to pick a Procurement
    // Item while looking at the Requisition itself.
    reverseLookup: {
      table: "procurement_items",
      column: "requisition_id",
      label: "Linked Procurement Items",
      entityKey: "items",
      refLabel: codeLabel,
      editable: true,
    },
  },
  {
    key: "procurement-activities",
    table: "procurement_activities",
    singular: "Procurement Activity",
    plural: "Procurement Activities",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "procurement_activities", "PRC-ACT-", 6),
    // Wider than the generic line-items formula gives it -- Activity is a
    // long free-text label ("Pre-bid Conference", "Opening of Bids", ...)
    // and Remarks is free text too, so the auto-computed width still felt
    // cramped with a real schedule of several lines.
    modalWidth: "1200px",
    fields: [
      { name: "requisition_id", label: "Requisition", type: "reference", refTable: "purchase_requisitions", refLabel: codeLabel, required: true, inList: true },
      // The formal record of which method this specific activity/event is
      // executing under -- should match whatever was already decided on the
      // Procurement Items that were batched into this Requisition (see
      // "items" -> mode_id, migration 0048, where that call actually gets
      // made). Kept as its own field here rather than derived, since an
      // Activity is the real record of the event itself (e.g. you can't run
      // a Public Bidding activity for items tagged Shopping). Also decides
      // what happens next -- Public Bidding implies a formal bid opening,
      // Simplified/Shopping are meant to skip it -- though the actual
      // branching on this value isn't wired up yet (per the user's own
      // call: "we will revise the process" separately).
      { name: "mode_id", label: "Mode of Procurement", type: "reference", ...lookupRef("procurement_mode"), required: true, inList: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    // Activity/Date/Status live here now, one line per schedule step (Pre-bid
    // Conference, Opening of Bids, Award...) instead of on the record itself
    // (migration 0043) -- one Requisition + Mode of Procurement can cover a
    // whole schedule instead of needing a separate top-level record per
    // step. Bid Evaluation and Post-Qualification now identify a record by
    // its code + Requisition + Mode rather than a single Activity name,
    // since that name no longer lives on the parent row.
    lineItems: {
      table: "procurement_activity_lines",
      parentColumn: "procurement_activity_id",
      label: "Activity Schedule",
      addLabel: "+ Add Line",
      fields: [
        { name: "activity", label: "Activity", type: "text", required: true, placeholder: "e.g. Pre-bid Conference, Opening of Bids" },
        { name: "activity_date", label: "Date", type: "date", required: true },
        { name: "status_id", label: "Status", type: "reference", ...lookupRef("procurement_activity_status"), required: true },
        { name: "remarks", label: "Remarks", type: "text" },
      ],
      emptyLine: () => ({ activity: "", activity_date: "", status_id: "", remarks: "" }),
    },
  },
  {
    // Standalone module for the required-documents *template* per bid
    // evaluation -- which documents bidders must submit, grouped by section
    // (see the bid-evaluation matrix at /bid-evaluation for the actual
    // per-bidder Pass/Fail grid, bid offers, and bid security -- this page
    // just manages the list of required documents). No owner_id column on
    // this table -- writes are gated by owns_procurement_activity() via the
    // parent Procurement Activity instead, see supabase/migrations/
    // 0020_rfq_document_checklist.sql, 0021_bid_evaluation_matrix.sql, and
    // 0041_retire_vendor_bidding_module_for_procurement_activities.sql
    // (retargeted from the now-retired Vendor Bidding/RFQ module).
    key: "rfq-checklist",
    table: "rfq_document_checklist",
    singular: "Bid Document Checklist Item",
    plural: "Bid Documents Checklist",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "document_name",
    noOwner: true,
    fields: [
      { name: "activity_id", label: "Procurement Activity", type: "reference", refTable: "procurement_activities", refLabel: codeLabel, required: true, inList: true },
      { name: "section", label: "Section", type: "text", required: true, placeholder: "e.g. Administrative, Technical, Legal, Financial", inList: true },
      { name: "document_name", label: "Document Name", type: "text", required: true, placeholder: "e.g. Bid Bond", inList: true },
      { name: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    // The RA 9184 step after Bid Evaluation and before Award/PO: verify
    // the winning bidder's legal/technical/financial documents, run a
    // site/equipment inspection, check financial capacity (NFCC/SLCC), and
    // record a final Passed/Failed decision. Linked to the winning
    // supplier or contractor directly (migration 0042) -- not to a
    // specific vendor_bids row -- and kept a standalone module rather than
    // built into Bid Evaluation or Purchase Orders, per the user's own
    // call. Not wired up as a gate on Purchase Orders -- a PO can still be
    // created regardless of this module's decision, same
    // intentionally-unautomated-branching approach as Procurement
    // Activities' own Mode of Procurement (migration 0036).
    key: "post-qualifications",
    table: "post_qualifications",
    singular: "Post-Qualification",
    plural: "Post-Qualifications",
    module: "procurement",
    breadcrumb: "Procurement Plan",
    primaryField: "code",
    makeCode: (sb) => nextSequentialCode(sb, "post_qualifications", "PRC-PQ-", 6),
    fields: [
      { name: "activity_id", label: "Procurement Activity", type: "reference", refTable: "procurement_activities", refLabel: codeLabel, required: true, inList: true },
      { name: "winning_vendor_id", label: "Winning Supplier", type: "reference", refTable: "vendors", refLabel: nameLabel, inList: true, help: "Set a supplier or a contractor, not both" },
      { name: "winning_contractor_id", label: "Winning Contractor", type: "reference", refTable: "contractors", refLabel: nameLabel },
      { name: "nfcc_amount", label: "Net Financial Contracting Capacity (NFCC)", type: "currency", help: "The bidder's computed NFCC, checked against the project's approved budget" },
      { name: "slcc_amount", label: "Single Largest Completed Contract (SLCC)", type: "currency", help: "Value of the bidder's Single Largest Completed Contract within the relevant period" },
      { name: "site_inspection_result_id", label: "Site Inspection Result", type: "reference", ...lookupRef("post_qualification_result"), inList: true, badge: true, help: "Leave as Not Applicable for procurements that don't require an inspection" },
      { name: "site_inspection_notes", label: "Site Inspection Notes", type: "textarea" },
      { name: "decision_id", label: "Decision", type: "reference", ...lookupRef("post_qualification_status"), required: true, inList: true, badge: true },
      { name: "decided_by", label: "Decided By", type: "text" },
      { name: "decision_date", label: "Decision Date", type: "date" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    // Per-document Pass/Fail checklist scoped to this one winning bidder --
    // a plain boolean column per line is enough here since (unlike Bid
    // Evaluation's rfq_document_checklist + rfq_checklist_results, which
    // has to support many bidders against the same checklist) there's only
    // ever one bidder in play. Pre-populated with a standard set of RA 9184
    // post-qual documents so a fresh record doesn't start completely empty.
    lineItems: {
      table: "post_qualification_checklist",
      parentColumn: "post_qualification_id",
      label: "Post-Qualification Document Checklist",
      addLabel: "+ Add Document",
      fields: [
        { name: "section", label: "Section", type: "text", required: true, placeholder: "e.g. Legal, Technical, Financial" },
        { name: "document_name", label: "Document Name", type: "text", required: true },
        { name: "passed", label: "Passed", type: "boolean" },
        { name: "remarks", label: "Remarks", type: "text" },
      ],
      emptyLine: () => ({ section: "", document_name: "", passed: false, remarks: "" }),
      defaultLines: () => [
        { section: "Legal", document_name: "Updated PhilGEPS Registration", passed: false, remarks: "" },
        { section: "Legal", document_name: "Valid Business/Mayor's Permit", passed: false, remarks: "" },
        { section: "Legal", document_name: "Tax Clearance Certificate", passed: false, remarks: "" },
        { section: "Technical", document_name: "Statement of Ongoing and Completed Contracts", passed: false, remarks: "" },
        { section: "Technical", document_name: "List of Equipment and Key Personnel", passed: false, remarks: "" },
        { section: "Financial", document_name: "Audited Financial Statements", passed: false, remarks: "" },
        { section: "Financial", document_name: "NFCC / Credit Line Computation", passed: false, remarks: "" },
      ],
    },
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
      // Wires the Charter to Procurement (migration 0054) -- picking a
      // Purchase Order here pulls its Notice to Proceed date into Start
      // Date below immediately, and keeps following it if the PO's NTP
      // date changes later (trigger-maintained, same shape as the BOM ->
      // Asset Request cost sync). Optional: a Charter can exist before
      // procurement even starts, in which case Start Date is just a normal
      // manually-entered field until a PO gets linked.
      { name: "purchase_order_id", label: "Purchase Order (Notice to Proceed)", type: "reference", refTable: "purchase_orders", refLabel: codeLabel, inList: true, help: "Linking a PO pulls its Notice to Proceed date into Start Date, and keeps following it" },
      { name: "start_date", label: "Start Date", type: "date", required: true, help: "Auto-follows the linked Purchase Order's Notice to Proceed date once one is linked; editable by hand otherwise" },
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
