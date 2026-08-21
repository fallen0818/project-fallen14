"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { escapeCsvValue, downloadFile } from "@/lib/utils";
import { useRole } from "@/lib/auth/role-context";

/**
 * Bid Evaluation Matrix — the standalone checklist (rfq-checklist entity,
 * `rfq_document_checklist`) lists the required documents per bid evaluation,
 * but the real bid-opening workflow needs a per-*bidder* Pass/Fail grid,
 * grouped by section, plus each bidder's Bid Offer and Bid Security --
 * exactly the shape of the paper checklist used during bid opening. That's a
 * spreadsheet-like matrix, not a generic list+modal, so this is a bespoke
 * page rather than another entity in the CRUD engine (see supabase/
 * migrations/0021_bid_evaluation_matrix.sql for the schema this reads/
 * writes).
 *
 * Anchored on a Procurement Activity (procurement_activities), not a
 * standalone RFQ -- the earlier "Vendor Bidding (RFQs)" module was retired
 * once Procurement Activities could already record which step a requisition
 * is on: one Public Bidding activity IS the RFQ event now, so there was no
 * need for a second, parallel entity modeling the same thing (migration
 * 0041, retire_vendor_bidding_module_for_procurement_activities). vendor_bids
 * and rfq_document_checklist were repointed from vendor_biddings to
 * procurement_activities directly (bidding_id renamed to activity_id on
 * both) rather than replaced. Activity/Date/Status themselves later moved
 * off the Procurement Activity record onto a repeatable schedule
 * (procurement_activity_lines, migration 0043) -- this page only needs the
 * activity's code + Mode of Procurement to label the picker, not that
 * schedule.
 *
 * There used to be a per-item bidder pricing table here (Item Price Quotes,
 * vendor_bid_line_quotes), sourced from whichever Procurement Items were
 * attached to the activity's Requisition via purchase_requisition_lines.
 * That link was removed by the user's own call (migration 0046 --
 * Requisitions and Procurement Items are no longer related at all), which
 * took per-item pricing down with it: there's no more well-defined list of
 * "this activity's items" to price line-by-line. Bid Offer/Bid Security
 * below now carry the whole-bid amount instead.
 */

interface ActivityOption {
  id: string;
  code: string;
  mode: { value: string } | null;
  requisition_id: string;
}

interface NameOption {
  id: string;
  name: string;
}

interface BidderRow {
  id: string;
  vendor_id: string | null;
  contractor_id: string | null;
  name: string;
  total_price: number | null;
  bid_security_amount: number | null;
  warranty_value: number | null;
  warranty_unit: string | null;
  delivery_value: number | null;
  delivery_unit: string | null;
}

interface ChecklistItemRow {
  id: string;
  section: string;
  document_name: string;
  remarks: string | null;
}

const SECTION_SUGGESTIONS = ["Technical", "Legal", "Financial"];

// Mirrors the sample bid-opening checklist (sections + document order), so a
// brand-new bid evaluation can start from the same 20-item baseline instead
// of everyone retyping it by hand. The original sample's "Administrative"
// section was merged into "Legal" on request -- those 8 documents now group
// with Articles of Incorporation / By-Laws / Joint Venture Agreement below.
const STANDARD_TEMPLATE: { section: string; document_name: string }[] = [
  { section: "Legal", document_name: "Letter of Intent" },
  { section: "Legal", document_name: "Bid Form (signed)" },
  { section: "Legal", document_name: "Bid Security (Bank Guarantee / Surety Bond)" },
  { section: "Legal", document_name: "Valid Business Permit" },
  { section: "Legal", document_name: "Tax Clearance Certificate" },
  { section: "Legal", document_name: "PhilGEPS Registration Certificate" },
  { section: "Legal", document_name: "SEC/DTI Registration" },
  { section: "Legal", document_name: "Audited Financial Statements" },
  { section: "Legal", document_name: "Articles of Incorporation / Partnership" },
  { section: "Legal", document_name: "By-Laws" },
  { section: "Legal", document_name: "Joint Venture Agreement (if applicable)" },
  { section: "Technical", document_name: "Statement of Ongoing Contracts" },
  { section: "Technical", document_name: "Statement of Completed Contracts" },
  { section: "Technical", document_name: "List of Key Personnel with CVs" },
  { section: "Technical", document_name: "List of Equipment Available" },
  { section: "Technical", document_name: "Project Methodology / Work Plan" },
  { section: "Financial", document_name: "Bill of Quantities" },
  { section: "Financial", document_name: "Detailed Cost Estimates" },
  { section: "Financial", document_name: "Cash Flow Projection" },
  { section: "Financial", document_name: "Schedule of Payments" },
];

function resultKey(checklistItemId: string, vendorBidId: string): string {
  return `${checklistItemId}:${vendorBidId}`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/** "1234567.5" -> "1,234,567.50" (plain number, no currency symbol). */
function formatAmount(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "1,234,567.50" -> 1234567.5 (strips thousands commas before parsing). */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

/** Plain numeric display for small counts like warranty/delivery duration
 *  (e.g. "2" or "1.5") -- no forced decimals or thousands separators, unlike
 *  the currency-formatted amounts above. */
function formatDuration(value: number | null): string {
  return value === null || Number.isNaN(value) ? "" : String(value);
}

// Bids don't carry their own linked Procurement Activity, so there's no
// per-activity currency to inherit anymore (the old RFQ's Currency field
// was dropped rather than moved over, migration 0041) -- every amount here
// just uses the app-wide default, same as every other currency field.
const CURRENCY = "PHP";

export function BidEvaluationMatrix() {
  const supabase = createClient();
  const showToast = useToast();
  // Bid opening is a write-heavy workflow (marks, prices, warranty/delivery
  // terms) -- viewers get the same matrix read-only, RLS blocks the writes
  // regardless, this just keeps them from tapping controls that would error.
  const isEditorRole = useRole() === "editor";

  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [allVendors, setAllVendors] = useState<NameOption[]>([]);
  const [allContractors, setAllContractors] = useState<NameOption[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Locks the matrix once Post-Qualification has decided a winner for this
  // activity (decisionId resolves to "Passed") -- there's no "awarded" status
  // on procurement_activities itself anymore (that lived on the retired
  // vendor_biddings.status, migration 0041), so Post-Qualification's decision
  // is the closest real signal that bid opening is over and the matrix
  // shouldn't keep changing under the winner. RLS doesn't enforce this --
  // it's a UI-only lock, same class of gate as the viewer/editor role check
  // above.
  const [award, setAward] = useState<{ decision: string; decidedBy: string | null; decisionDate: string | null } | null>(null);
  const isLocked = award?.decision === "Passed";
  const canEdit = isEditorRole && !isLocked;

  const [bidders, setBidders] = useState<BidderRow[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemRow[]>([]);
  const [results, setResults] = useState<Map<string, boolean>>(new Map());

  const [addBidderChoice, setAddBidderChoice] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newDocument, setNewDocument] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [activityRes, vendorRes, contractorRes] = await Promise.all([
          supabase.from("procurement_activities").select("id, code, mode:lookup_options(value), requisition_id").order("code"),
          supabase.from("vendors").select("id, name").order("name"),
          supabase.from("contractors").select("id, name").order("name"),
        ]);
        if (activityRes.error) throw activityRes.error;
        if (vendorRes.error) throw vendorRes.error;
        if (contractorRes.error) throw contractorRes.error;
        setActivities((activityRes.data ?? []) as unknown as ActivityOption[]);
        setAllVendors((vendorRes.data ?? []) as NameOption[]);
        setAllContractors((contractorRes.data ?? []) as NameOption[]);
      } catch (err) {
        showToast(errorMessage(err), "error");
      } finally {
        setLoadingActivities(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const loadMatrix = useCallback(
    async (activityId: string) => {
      setLoadingMatrix(true);
      try {
        const [bidRes, itemRes] = await Promise.all([
          supabase
            .from("vendor_bids")
            .select(
              "id, vendor_id, contractor_id, total_price, bid_security_amount, warranty_value, warranty_unit, delivery_value, delivery_unit, vendor:vendors(name), contractor:contractors(name)",
            )
            .eq("activity_id", activityId)
            .order("created_at"),
          supabase
            .from("rfq_document_checklist")
            .select("id, section, document_name, remarks")
            .eq("activity_id", activityId)
            .order("created_at"),
        ]);
        if (bidRes.error) throw bidRes.error;
        if (itemRes.error) throw itemRes.error;

        type NameJoin = { name: string } | null;
        const bidderRows: BidderRow[] = (bidRes.data ?? []).map((r) => ({
          id: String(r.id),
          vendor_id: (r.vendor_id as string | null) ?? null,
          contractor_id: (r.contractor_id as string | null) ?? null,
          name:
            (r.vendor as unknown as NameJoin)?.name ??
            (r.contractor as unknown as NameJoin)?.name ??
            "Unnamed Bidder",
          total_price: r.total_price === null ? null : Number(r.total_price),
          bid_security_amount: r.bid_security_amount === null ? null : Number(r.bid_security_amount),
          warranty_value: r.warranty_value === null ? null : Number(r.warranty_value),
          warranty_unit: (r.warranty_unit as string | null) ?? null,
          delivery_value: r.delivery_value === null ? null : Number(r.delivery_value),
          delivery_unit: (r.delivery_unit as string | null) ?? null,
        }));
        const items = (itemRes.data ?? []) as ChecklistItemRow[];

        const itemIds = items.map((i) => i.id);

        let resultMap = new Map<string, boolean>();
        if (itemIds.length > 0) {
          const { data: resData, error: resErr } = await supabase
            .from("rfq_checklist_results")
            .select("checklist_item_id, vendor_bid_id, passed")
            .in("checklist_item_id", itemIds);
          if (resErr) throw resErr;
          resultMap = new Map(
            (resData ?? []).map((r) => [
              resultKey(String(r.checklist_item_id), String(r.vendor_bid_id)),
              Boolean(r.passed),
            ]),
          );
        }

        setBidders(bidderRows);
        setChecklistItems(items);
        setResults(resultMap);
      } catch (err) {
        showToast(errorMessage(err), "error");
      } finally {
        setLoadingMatrix(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (selectedActivityId) {
      loadMatrix(selectedActivityId);
    } else {
      setBidders([]);
      setChecklistItems([]);
      setResults(new Map());
    }
  }, [selectedActivityId, loadMatrix]);

  // No unique constraint ties one Procurement Activity to at most one
  // Post-Qualification record, so this takes the most recently decided one
  // rather than assuming there's only ever one row.
  useEffect(() => {
    if (!selectedActivityId) {
      setAward(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("post_qualifications")
          .select("decided_by, decision_date, decision:lookup_options(value)")
          .eq("activity_id", selectedActivityId)
          .order("decision_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        type DecisionJoin = { value: string } | null;
        const row = (data ?? [])[0] as { decided_by: string | null; decision_date: string | null; decision: unknown } | undefined;
        setAward(
          row
            ? {
                decision: (row.decision as unknown as DecisionJoin)?.value ?? "",
                decidedBy: row.decided_by,
                decisionDate: row.decision_date,
              }
            : null,
        );
      } catch {
        // Non-fatal -- the matrix still works, it just won't know to lock
        // itself. Surfacing this as a toast would be noisier than useful
        // given it fires on every activity switch.
        setAward(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [selectedActivityId]);

  const selectedActivity = activities.find((a) => a.id === selectedActivityId);

  async function addBidder(kind: "vendor" | "contractor", id: string) {
    if (!canEdit || !selectedActivityId) return;
    try {
      const payload: Record<string, unknown> = {
        activity_id: selectedActivityId,
        total_price: 0,
        currency: CURRENCY,
        [kind === "vendor" ? "vendor_id" : "contractor_id"]: id,
      };
      const { data, error } = await supabase
        .from("vendor_bids")
        .insert(payload)
        .select(
          "id, vendor_id, contractor_id, total_price, bid_security_amount, warranty_value, warranty_unit, delivery_value, delivery_unit, vendor:vendors(name), contractor:contractors(name)",
        )
        .single();
      if (error) throw error;
      type NameJoin = { name: string } | null;
      const row = data as {
        id: string;
        vendor_id: string | null;
        contractor_id: string | null;
        total_price: number | null;
        bid_security_amount: number | null;
        warranty_value: number | null;
        warranty_unit: string | null;
        delivery_value: number | null;
        delivery_unit: string | null;
        vendor: unknown;
        contractor: unknown;
      };
      setBidders((prev) => [
        ...prev,
        {
          id: String(row.id),
          vendor_id: row.vendor_id,
          contractor_id: row.contractor_id,
          name: (row.vendor as unknown as NameJoin)?.name ?? (row.contractor as unknown as NameJoin)?.name ?? "Unnamed Bidder",
          total_price: row.total_price === null ? null : Number(row.total_price),
          bid_security_amount: row.bid_security_amount === null ? null : Number(row.bid_security_amount),
          warranty_value: row.warranty_value === null ? null : Number(row.warranty_value),
          warranty_unit: row.warranty_unit ?? null,
          delivery_value: row.delivery_value === null ? null : Number(row.delivery_value),
          delivery_unit: row.delivery_unit ?? null,
        },
      ]);
      setAddBidderChoice("");
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  function handleAddBidderClick() {
    const [kind, id] = addBidderChoice.split(":");
    if ((kind === "vendor" || kind === "contractor") && id) addBidder(kind, id);
  }

  async function removeBidder(bidderId: string) {
    if (!canEdit) return;
    if (!confirm("Remove this bidder? This also clears their Pass/Fail marks and bid amounts.")) return;
    try {
      const { error } = await supabase.from("vendor_bids").delete().eq("id", bidderId);
      if (error) throw error;
      setBidders((prev) => prev.filter((b) => b.id !== bidderId));
      setResults((prev) => {
        const next = new Map(prev);
        for (const key of Array.from(next.keys())) {
          if (key.endsWith(`:${bidderId}`)) next.delete(key);
        }
        return next;
      });
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  async function saveBidderAmount(bidderId: string, field: "total_price" | "bid_security_amount", value: number | null) {
    if (!canEdit) return;
    try {
      const { error } = await supabase.from("vendor_bids").update({ [field]: value }).eq("id", bidderId);
      if (error) throw error;
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  /** Warranty and delivery schedule are value+unit pairs (e.g. "2 years",
   *  "45 days") -- saved together so the unit is never left out of sync with
   *  the value, whichever of the pair the bidder actually edited. */
  async function saveBidderPair(
    bidderId: string,
    valueField: "warranty_value" | "delivery_value",
    unitField: "warranty_unit" | "delivery_unit",
    value: number | null,
    unit: string | null,
  ) {
    if (!canEdit) return;
    try {
      const { error } = await supabase
        .from("vendor_bids")
        .update({ [valueField]: value, [unitField]: unit })
        .eq("id", bidderId);
      if (error) throw error;
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  async function addChecklistItem(section: string, documentName: string) {
    if (!canEdit || !selectedActivityId || !section.trim() || !documentName.trim()) return;
    try {
      const { data, error } = await supabase
        .from("rfq_document_checklist")
        .insert({ activity_id: selectedActivityId, section: section.trim(), document_name: documentName.trim() })
        .select("id, section, document_name, remarks")
        .single();
      if (error) throw error;
      setChecklistItems((prev) => [...prev, data as ChecklistItemRow]);
      setNewSection("");
      setNewDocument("");
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  async function removeChecklistItem(itemId: string) {
    if (!canEdit) return;
    if (!confirm("Remove this document requirement? This also clears every bidder's Pass/Fail mark for it.")) return;
    try {
      const { error } = await supabase.from("rfq_document_checklist").delete().eq("id", itemId);
      if (error) throw error;
      setChecklistItems((prev) => prev.filter((c) => c.id !== itemId));
      setResults((prev) => {
        const next = new Map(prev);
        for (const key of Array.from(next.keys())) {
          if (key.startsWith(`${itemId}:`)) next.delete(key);
        }
        return next;
      });
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  async function saveChecklistField(itemId: string, field: "document_name" | "remarks", value: string) {
    if (!canEdit) return;
    try {
      const payload = field === "remarks" ? { remarks: value.trim() === "" ? null : value } : { document_name: value };
      const { error } = await supabase.from("rfq_document_checklist").update(payload).eq("id", itemId);
      if (error) throw error;
    } catch (err) {
      showToast(errorMessage(err), "error");
    }
  }

  async function togglePass(checklistItemId: string, vendorBidId: string, next: boolean) {
    if (!canEdit) return;
    const key = resultKey(checklistItemId, vendorBidId);
    setResults((prev) => new Map(prev).set(key, next));
    try {
      const { error } = await supabase
        .from("rfq_checklist_results")
        .upsert(
          { checklist_item_id: checklistItemId, vendor_bid_id: vendorBidId, passed: next },
          { onConflict: "checklist_item_id,vendor_bid_id" },
        );
      if (error) throw error;
    } catch (err) {
      setResults((prev) => new Map(prev).set(key, !next));
      showToast(errorMessage(err), "error");
    }
  }

  async function loadStandardTemplate() {
    if (!canEdit || !selectedActivityId) return;
    setLoadingTemplate(true);
    try {
      const payload = STANDARD_TEMPLATE.map((t) => ({ activity_id: selectedActivityId, section: t.section, document_name: t.document_name }));
      const { data, error } = await supabase.from("rfq_document_checklist").insert(payload).select("id, section, document_name, remarks");
      if (error) throw error;
      setChecklistItems((prev) => [...prev, ...((data ?? []) as ChecklistItemRow[])]);
      showToast("Standard checklist loaded", "success");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setLoadingTemplate(false);
    }
  }

  function exportCsv() {
    if (!selectedActivity) return;
    const bidderNames = bidders.map((b) => b.name);
    const blankBidderCells = bidderNames.map(() => "");
    const lines: string[][] = [];
    lines.push(["Name of Bidders:", "", ...bidderNames, ""]);
    lines.push(["", "", ...blankBidderCells, ""]);
    lines.push(["Section", "Document / Requirement", ...bidderNames.map(() => "Pass"), "Remarks"]);
    for (const section of sectionOrder) {
      const items = checklistItems.filter((c) => c.section === section);
      items.forEach((item, idx) => {
        const marks = bidders.map((b) => (results.get(resultKey(item.id, b.id)) ? "☑" : "☐"));
        lines.push([idx === 0 ? section : "", item.document_name, ...marks, item.remarks ?? ""]);
      });
    }
    lines.push(["", "", ...blankBidderCells, ""]);
    lines.push(["", "Bid offer, Php", ...bidders.map((b) => (b.total_price != null ? String(b.total_price) : "")), ""]);
    lines.push(["", "Bid security, Php", ...bidders.map((b) => (b.bid_security_amount != null ? String(b.bid_security_amount) : "")), ""]);
    lines.push([
      "",
      "Warranty",
      ...bidders.map((b) => (b.warranty_value != null ? `${b.warranty_value} ${b.warranty_unit === "months" ? "mo(s)" : "yr(s)"}` : "")),
      "",
    ]);
    lines.push([
      "",
      "Delivery schedule",
      ...bidders.map((b) => (b.delivery_value != null ? `${b.delivery_value} ${b.delivery_unit === "months" ? "mo(s)" : "day(s)"}` : "")),
      "",
    ]);
    const csv = lines.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
    downloadFile(csv, `bid-evaluation-${selectedActivity.code}.csv`);
  }

  const biddingVendorIds = new Set(bidders.map((b) => b.vendor_id).filter(Boolean));
  const biddingContractorIds = new Set(bidders.map((b) => b.contractor_id).filter(Boolean));
  const availableVendors = allVendors.filter((v) => !biddingVendorIds.has(v.id));
  const availableContractors = allContractors.filter((v) => !biddingContractorIds.has(v.id));

  // Sections in the order documents were first added, not alphabetical --
  // matches how the sample sheet groups Administrative before Technical
  // before Legal before Financial (a deliberate review order, not A-Z).
  const sectionOrder = Array.from(new Set(checklistItems.map((c) => c.section)));

  return (
    <>
      <PageHeader
        breadcrumb="Procurement Plan"
        title="Bid Evaluation"
        actions={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <select
              className="select"
              style={{ width: "auto", minWidth: 240 }}
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              disabled={loadingActivities}
            >
              <option value="">{loadingActivities ? "Loading Procurement Activities…" : "Select a Procurement Activity…"}</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code}
                  {a.mode?.value ? ` · ${a.mode.value}` : ""}
                </option>
              ))}
            </select>
            {selectedActivityId && (
              <Button variant="secondary" onClick={exportCsv} disabled={checklistItems.length === 0}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {selectedActivityId && isLocked && (
        <div
          className="card"
          style={{ marginBottom: "1rem", borderLeft: "4px solid var(--color-warning, #b45309)", display: "flex", gap: "0.5rem", alignItems: "baseline" }}
        >
          <strong>Locked.</strong>
          <span style={{ color: "var(--on-surface-variant)" }}>
            Post-Qualification decided a winner{award?.decidedBy ? ` (${award.decidedBy})` : ""}
            {award?.decisionDate ? ` on ${award.decisionDate}` : ""} — this matrix is read-only for everyone now, to keep the record
            that the decision was made against from changing underneath it.
          </span>
        </div>
      )}

      {!selectedActivityId ? (
        <div className="card" style={{ textAlign: "center", color: "var(--on-surface-variant)" }}>
          Select a Procurement Activity above to open its bid evaluation matrix.
        </div>
      ) : loadingMatrix ? (
        <p style={{ color: "var(--on-surface-variant)" }}>Loading…</p>
      ) : (
        <>
          {canEdit && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              <div className="card" style={{ padding: "0.75rem 1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span className="label-sm" style={{ margin: 0 }}>Add Bidder</span>
                <select
                  className="select"
                  style={{ width: "auto", minWidth: 200 }}
                  value={addBidderChoice}
                  onChange={(e) => setAddBidderChoice(e.target.value)}
                >
                  <option value="">Select a supplier or contractor…</option>
                  {availableVendors.length > 0 && (
                    <optgroup label="Suppliers">
                      {availableVendors.map((v) => (
                        <option key={`v-${v.id}`} value={`vendor:${v.id}`}>{v.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {availableContractors.length > 0 && (
                    <optgroup label="Contractors">
                      {availableContractors.map((v) => (
                        <option key={`c-${v.id}`} value={`contractor:${v.id}`}>{v.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <Button variant="secondary" disabled={!addBidderChoice} onClick={handleAddBidderClick} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                  + Add
                </Button>
              </div>

              <div className="card" style={{ padding: "0.75rem 1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span className="label-sm" style={{ margin: 0 }}>Add Document</span>
                <input
                  className="input"
                  list="section-suggestions"
                  style={{ width: 150, padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
                  placeholder="Section"
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                />
                <datalist id="section-suggestions">
                  {Array.from(new Set([...SECTION_SUGGESTIONS, ...sectionOrder])).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <input
                  className="input"
                  style={{ width: 220, padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
                  placeholder="Document name"
                  value={newDocument}
                  onChange={(e) => setNewDocument(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={!newSection.trim() || !newDocument.trim()}
                  onClick={() => addChecklistItem(newSection, newDocument)}
                  style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                >
                  + Add
                </Button>
              </div>

              {checklistItems.length === 0 && (
                <Button variant="secondary" disabled={loadingTemplate} onClick={loadStandardTemplate} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                  {loadingTemplate ? "Loading…" : "Load Standard Checklist"}
                </Button>
              )}
            </div>
          )}

          {canEdit && bidders.length === 0 && (
            <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)", marginBottom: "0.75rem" }}>
              Add at least one bidder to start marking documents Pass/Fail.
            </p>
          )}

          <div className="card" style={{ padding: "1rem", overflowX: "auto" }}>
            <div style={{ minWidth: 480 + bidders.length * 130 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th className="label-sm" style={{ textAlign: "left", padding: "0.6rem 0.75rem" }}>Section</th>
                    <th className="label-sm" style={{ textAlign: "left", padding: "0.6rem 0.75rem" }}>Document / Requirement</th>
                    {bidders.map((b) => (
                      <th key={b.id} style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.78rem" }}>{b.name}</span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeBidder(b.id)}
                              title="Remove bidder"
                              aria-label="Remove bidder"
                              style={{ background: "none", border: "none", color: "var(--on-surface-variant)", cursor: "pointer", fontSize: "0.95rem", padding: 0, lineHeight: 1 }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="label-sm" style={{ textAlign: "left", padding: "0.6rem 0.75rem" }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionOrder.length === 0 ? (
                    <tr>
                      <td colSpan={3 + bidders.length} style={{ padding: "1.5rem", textAlign: "center", color: "var(--on-surface-variant)" }}>
                        No document requirements yet. Add one above, or load the standard checklist.
                      </td>
                    </tr>
                  ) : (
                    sectionOrder.flatMap((section) => {
                      const items = checklistItems.filter((c) => c.section === section);
                      return items.map((item, idx) => (
                        <tr key={item.id} style={{ borderTop: "1px solid var(--surface-container-high)" }}>
                          {idx === 0 && (
                            <td
                              rowSpan={items.length}
                              style={{ padding: "0.6rem 0.75rem", fontWeight: 700, verticalAlign: "top", background: "var(--surface-container-low)" }}
                            >
                              {section}
                            </td>
                          )}
                          <td style={{ padding: "0.5rem 0.75rem" }}>
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              <input
                                className="input"
                                style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                                defaultValue={item.document_name}
                                disabled={!canEdit}
                                onBlur={(e) => {
                                  const value = e.target.value;
                                  if (value !== item.document_name) {
                                    saveChecklistField(item.id, "document_name", value);
                                    setChecklistItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, document_name: value } : c)));
                                  }
                                }}
                              />
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => removeChecklistItem(item.id)}
                                  title="Remove document"
                                  style={{ background: "none", border: "none", color: "var(--error, #b3261e)", cursor: "pointer" }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </td>
                          {bidders.map((b) => (
                            <td key={b.id} style={{ textAlign: "center", padding: "0.5rem" }}>
                              <input
                                type="checkbox"
                                checked={Boolean(results.get(resultKey(item.id, b.id)))}
                                onChange={(e) => togglePass(item.id, b.id, e.target.checked)}
                                disabled={!canEdit}
                                style={{ width: "1.15rem", height: "1.15rem" }}
                              />
                            </td>
                          ))}
                          <td style={{ padding: "0.5rem 0.75rem" }}>
                            <input
                              className="input"
                              style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                              placeholder="—"
                              defaultValue={item.remarks ?? ""}
                              disabled={!canEdit}
                              onBlur={(e) => {
                                const value = e.target.value;
                                if ((item.remarks ?? "") !== value) {
                                  saveChecklistField(item.id, "remarks", value);
                                  setChecklistItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, remarks: value } : c)));
                                }
                              }}
                            />
                          </td>
                        </tr>
                      ));
                    })
                  )}
                </tbody>
                {bidders.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--outline-variant)" }}>
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Bid Offer, {CURRENCY}</td>
                      {bidders.map((b) => (
                        <td key={b.id} style={{ padding: "0.4rem 0.5rem" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input"
                            style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", textAlign: "right" }}
                            defaultValue={formatAmount(b.total_price)}
                            disabled={!canEdit}
                            onFocus={(e) => {
                              e.target.value = b.total_price === null ? "" : String(b.total_price);
                            }}
                            onBlur={(e) => {
                              const parsed = parseAmount(e.target.value);
                              e.target.value = formatAmount(parsed);
                              if (parsed !== b.total_price) {
                                setBidders((prev) => prev.map((x) => (x.id === b.id ? { ...x, total_price: parsed } : x)));
                                saveBidderAmount(b.id, "total_price", parsed);
                              }
                            }}
                          />
                        </td>
                      ))}
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Bid Security, {CURRENCY}</td>
                      {bidders.map((b) => (
                        <td key={b.id} style={{ padding: "0.4rem 0.5rem" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input"
                            style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", textAlign: "right" }}
                            defaultValue={formatAmount(b.bid_security_amount)}
                            disabled={!canEdit}
                            onFocus={(e) => {
                              e.target.value = b.bid_security_amount === null ? "" : String(b.bid_security_amount);
                            }}
                            onBlur={(e) => {
                              const parsed = parseAmount(e.target.value);
                              e.target.value = formatAmount(parsed);
                              if (parsed !== b.bid_security_amount) {
                                setBidders((prev) => prev.map((x) => (x.id === b.id ? { ...x, bid_security_amount: parsed } : x)));
                                saveBidderAmount(b.id, "bid_security_amount", parsed);
                              }
                            }}
                          />
                        </td>
                      ))}
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Warranty</td>
                      {bidders.map((b) => (
                        <td key={b.id} style={{ padding: "0.4rem 0.5rem" }}>
                          <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", justifyContent: "flex-end" }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="input"
                              style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", textAlign: "right", width: 60 }}
                              defaultValue={formatDuration(b.warranty_value)}
                              disabled={!canEdit}
                              onFocus={(e) => {
                                e.target.value = b.warranty_value === null ? "" : String(b.warranty_value);
                              }}
                              onBlur={(e) => {
                                const parsed = parseAmount(e.target.value);
                                e.target.value = formatDuration(parsed);
                                if (parsed !== b.warranty_value) {
                                  const unit = b.warranty_unit ?? "years";
                                  setBidders((prev) =>
                                    prev.map((x) => (x.id === b.id ? { ...x, warranty_value: parsed, warranty_unit: unit } : x)),
                                  );
                                  saveBidderPair(b.id, "warranty_value", "warranty_unit", parsed, unit);
                                }
                              }}
                            />
                            <select
                              className="select"
                              style={{ padding: "0.3rem 0.35rem", fontSize: "0.78rem", width: "auto" }}
                              value={b.warranty_unit ?? "years"}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const unit = e.target.value;
                                setBidders((prev) => prev.map((x) => (x.id === b.id ? { ...x, warranty_unit: unit } : x)));
                                saveBidderPair(b.id, "warranty_value", "warranty_unit", b.warranty_value, unit);
                              }}
                            >
                              <option value="years">yrs</option>
                              <option value="months">mos</option>
                            </select>
                          </div>
                        </td>
                      ))}
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Delivery Schedule</td>
                      {bidders.map((b) => (
                        <td key={b.id} style={{ padding: "0.4rem 0.5rem" }}>
                          <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", justifyContent: "flex-end" }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="input"
                              style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", textAlign: "right", width: 60 }}
                              defaultValue={formatDuration(b.delivery_value)}
                              disabled={!canEdit}
                              onFocus={(e) => {
                                e.target.value = b.delivery_value === null ? "" : String(b.delivery_value);
                              }}
                              onBlur={(e) => {
                                const parsed = parseAmount(e.target.value);
                                e.target.value = formatDuration(parsed);
                                if (parsed !== b.delivery_value) {
                                  const unit = b.delivery_unit ?? "days";
                                  setBidders((prev) =>
                                    prev.map((x) => (x.id === b.id ? { ...x, delivery_value: parsed, delivery_unit: unit } : x)),
                                  );
                                  saveBidderPair(b.id, "delivery_value", "delivery_unit", parsed, unit);
                                }
                              }}
                            />
                            <select
                              className="select"
                              style={{ padding: "0.3rem 0.35rem", fontSize: "0.78rem", width: "auto" }}
                              value={b.delivery_unit ?? "days"}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const unit = e.target.value;
                                setBidders((prev) => prev.map((x) => (x.id === b.id ? { ...x, delivery_unit: unit } : x)));
                                saveBidderPair(b.id, "delivery_value", "delivery_unit", b.delivery_value, unit);
                              }}
                            >
                              <option value="days">days</option>
                              <option value="months">mos</option>
                            </select>
                          </div>
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
