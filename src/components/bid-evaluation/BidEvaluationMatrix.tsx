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
 * `rfq_document_checklist`) lists the required documents per RFQ, but the
 * real bid-opening workflow needs a per-*bidder* Pass/Fail grid, grouped by
 * section, plus each bidder's Bid Offer and Bid Security -- exactly the
 * shape of the paper checklist used during bid opening. That's a spreadsheet
 * -like matrix, not a generic list+modal, so this is a bespoke page rather
 * than another entity in the CRUD engine (see supabase/migrations/
 * 0021_bid_evaluation_matrix.sql for the schema this reads/writes).
 *
 * Per-item bidder pricing: an RFQ's procurement items are attached one level
 * up, on its Requisition (the "requisitions" entity's own line-items list,
 * backed by purchase_requisition_lines — see configs.ts). This page only
 * *displays* those items, one row per item, with an editable unit price per
 * bidder (vendor_bid_line_quotes). Adding/removing which items are on the
 * RFQ happens on the Requisition itself, not here — keeps a single place
 * that owns "what items does this procurement cover" instead of letting the
 * RFQ and the requisition drift out of sync with each other.
 */

interface RfqOption {
  id: string;
  code: string;
  title: string | null;
  currency: string | null;
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

// A procurement item attached to the RFQ's requisition (via
// purchase_requisition_lines, managed on the Requisitions module), shown
// here so bidders can be compared line-by-line on unit price.
interface RfqItemRow {
  procurement_item_id: string;
  code: string;
  description: string;
  unit_of_measure: string;
  quantity: number;
  // The requisition line's own estimated_unit_cost if set, else the
  // procurement item's own estimated_unit_cost -- a baseline to size up
  // bidder quotes against, so it's rarely left blank/"—" even when no one's
  // refined the line-level estimate yet during sourcing.
  estimated_unit_cost: number | null;
}

const SECTION_SUGGESTIONS = ["Technical", "Legal", "Financial"];

// Mirrors the sample bid-opening checklist (sections + document order), so a
// brand-new RFQ can start from the same 20-item baseline instead of everyone
// retyping it by hand. The original sample's "Administrative" section was
// merged into "Legal" on request -- those 8 documents now group with
// Articles of Incorporation / By-Laws / Joint Venture Agreement below.
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

function quoteKey(procurementItemId: string, vendorBidId: string): string {
  return `${procurementItemId}:${vendorBidId}`;
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

export function BidEvaluationMatrix() {
  const supabase = createClient();
  const showToast = useToast();
  // Bid opening is a write-heavy workflow (marks, prices, warranty/delivery
  // terms) -- viewers get the same matrix read-only, RLS blocks the writes
  // regardless, this just keeps them from tapping controls that would error.
  const canEdit = useRole() === "editor";

  const [rfqs, setRfqs] = useState<RfqOption[]>([]);
  const [allVendors, setAllVendors] = useState<NameOption[]>([]);
  const [allContractors, setAllContractors] = useState<NameOption[]>([]);
  const [loadingRfqs, setLoadingRfqs] = useState(true);

  const [selectedRfqId, setSelectedRfqId] = useState<string>("");
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [bidders, setBidders] = useState<BidderRow[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemRow[]>([]);
  const [results, setResults] = useState<Map<string, boolean>>(new Map());
  const [rfqItems, setRfqItems] = useState<RfqItemRow[]>([]);
  const [quotes, setQuotes] = useState<Map<string, number>>(new Map());
  // requisition_id -> procurement item descriptions covered by it -- the
  // human-readable "subject" of an RFQ (what's actually being bid on), since
  // an RFQ's own code/title tells a bidder on the Zoom call nothing. Keyed
  // by requisition rather than RFQ id since that's what the join produces
  // directly; every RFQ's own requisition_id looks this up.
  const [subjectsByRequisition, setSubjectsByRequisition] = useState<Map<string, string[]>>(new Map());

  const [addBidderChoice, setAddBidderChoice] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newDocument, setNewDocument] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [rfqRes, vendorRes, contractorRes] = await Promise.all([
          supabase.from("vendor_biddings").select("id, code, title, currency, requisition_id").order("code"),
          supabase.from("vendors").select("id, name").order("name"),
          supabase.from("contractors").select("id, name").order("name"),
        ]);
        if (rfqRes.error) throw rfqRes.error;
        if (vendorRes.error) throw vendorRes.error;
        if (contractorRes.error) throw contractorRes.error;
        const rfqRows = (rfqRes.data ?? []) as RfqOption[];
        setRfqs(rfqRows);
        setAllVendors((vendorRes.data ?? []) as NameOption[]);
        setAllContractors((contractorRes.data ?? []) as NameOption[]);

        const requisitionIds = Array.from(new Set(rfqRows.map((r) => r.requisition_id)));
        if (requisitionIds.length > 0) {
          const { data: lineData, error: lineErr } = await supabase
            .from("purchase_requisition_lines")
            .select("requisition_id, procurement_item:procurement_items(description)")
            .in("requisition_id", requisitionIds);
          if (lineErr) throw lineErr;
          type DescJoin = { description: string } | null;
          const subjectMap = new Map<string, string[]>();
          for (const row of lineData ?? []) {
            const raw = row as Record<string, unknown>;
            const rid = String(raw.requisition_id);
            const description = (raw.procurement_item as unknown as DescJoin)?.description;
            if (!description) continue;
            subjectMap.set(rid, [...(subjectMap.get(rid) ?? []), description]);
          }
          setSubjectsByRequisition(subjectMap);
        }
      } catch (err) {
        showToast(errorMessage(err), "error");
      } finally {
        setLoadingRfqs(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  /** "Supply of 50 Laptops, Networking Cables +1 more" -- what to actually
   *  read out on the call, since an RFQ code means nothing to a bidder. */
  function subjectFor(requisitionId: string | undefined): string {
    const items = requisitionId ? (subjectsByRequisition.get(requisitionId) ?? []) : [];
    if (items.length === 0) return "";
    if (items.length <= 2) return items.join(", ");
    return `${items.slice(0, 2).join(", ")} +${items.length - 2} more`;
  }

  const loadMatrix = useCallback(
    async (rfqId: string, requisitionId?: string) => {
      setLoadingMatrix(true);
      try {
        const [bidRes, itemRes, rfqItemRes] = await Promise.all([
          supabase
            .from("vendor_bids")
            .select(
              "id, vendor_id, contractor_id, total_price, bid_security_amount, warranty_value, warranty_unit, delivery_value, delivery_unit, vendor:vendors(name), contractor:contractors(name)",
            )
            .eq("bidding_id", rfqId)
            .order("created_at"),
          supabase
            .from("rfq_document_checklist")
            .select("id, section, document_name, remarks")
            .eq("bidding_id", rfqId)
            .order("created_at"),
          requisitionId
            ? supabase
                .from("purchase_requisition_lines")
                .select("procurement_item_id, quantity, estimated_unit_cost, procurement_item:procurement_items(code, description, unit_of_measure, estimated_unit_cost)")
                .eq("requisition_id", requisitionId)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
        ]);
        if (bidRes.error) throw bidRes.error;
        if (itemRes.error) throw itemRes.error;
        if (rfqItemRes.error) throw rfqItemRes.error;

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

        type ProcItemJoin = { code: string; description: string; unit_of_measure: string; estimated_unit_cost: number | null } | null;
        const rfqItemRows: RfqItemRow[] = (rfqItemRes.data ?? []).map((r) => {
          const raw = r as Record<string, unknown>;
          const p = raw.procurement_item as unknown as ProcItemJoin;
          const lineCost = raw.estimated_unit_cost;
          const itemCost = p?.estimated_unit_cost;
          return {
            procurement_item_id: String(raw.procurement_item_id),
            code: p?.code ?? "",
            description: p?.description ?? "",
            unit_of_measure: p?.unit_of_measure ?? "",
            quantity: Number(raw.quantity),
            estimated_unit_cost: lineCost != null ? Number(lineCost) : itemCost != null ? Number(itemCost) : null,
          };
        });

        const itemIds = items.map((i) => i.id);
        const bidIds = bidderRows.map((b) => b.id);

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

        let quoteMap = new Map<string, number>();
        if (bidIds.length > 0) {
          const { data: quoteData, error: quoteErr } = await supabase
            .from("vendor_bid_line_quotes")
            .select("bid_id, procurement_item_id, unit_price")
            .in("bid_id", bidIds);
          if (quoteErr) throw quoteErr;
          quoteMap = new Map(
            (quoteData ?? []).map((r) => [
              quoteKey(String(r.procurement_item_id), String(r.bid_id)),
              Number(r.unit_price),
            ]),
          );
        }

        setBidders(bidderRows);
        setChecklistItems(items);
        setResults(resultMap);
        setRfqItems(rfqItemRows);
        setQuotes(quoteMap);
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
    if (selectedRfqId) {
      const requisitionId = rfqs.find((r) => r.id === selectedRfqId)?.requisition_id;
      loadMatrix(selectedRfqId, requisitionId);
    } else {
      setBidders([]);
      setChecklistItems([]);
      setResults(new Map());
      setRfqItems([]);
      setQuotes(new Map());
    }
  }, [selectedRfqId, loadMatrix, rfqs]);

  const selectedRfq = rfqs.find((r) => r.id === selectedRfqId);

  async function addBidder(kind: "vendor" | "contractor", id: string) {
    if (!canEdit || !selectedRfqId) return;
    try {
      const payload: Record<string, unknown> = {
        bidding_id: selectedRfqId,
        total_price: 0,
        currency: selectedRfq?.currency || "PHP",
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
    if (!confirm("Remove this bidder? This also clears their Pass/Fail marks, bid amounts, and item price quotes.")) return;
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
      setQuotes((prev) => {
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
    if (!canEdit || !selectedRfqId || !section.trim() || !documentName.trim()) return;
    try {
      const { data, error } = await supabase
        .from("rfq_document_checklist")
        .insert({ bidding_id: selectedRfqId, section: section.trim(), document_name: documentName.trim() })
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

  async function saveQuote(procurementItemId: string, vendorBidId: string, unitPrice: number | null) {
    if (!canEdit) return;
    const key = quoteKey(procurementItemId, vendorBidId);
    const prevValue = quotes.get(key);
    setQuotes((prev) => {
      const next = new Map(prev);
      if (unitPrice === null) next.delete(key);
      else next.set(key, unitPrice);
      return next;
    });
    try {
      if (unitPrice === null) {
        const { error } = await supabase
          .from("vendor_bid_line_quotes")
          .delete()
          .eq("bid_id", vendorBidId)
          .eq("procurement_item_id", procurementItemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("vendor_bid_line_quotes")
          .upsert(
            { bid_id: vendorBidId, procurement_item_id: procurementItemId, unit_price: unitPrice },
            { onConflict: "bid_id,procurement_item_id" },
          );
        if (error) throw error;
      }
    } catch (err) {
      setQuotes((prev) => {
        const next = new Map(prev);
        if (prevValue === undefined) next.delete(key);
        else next.set(key, prevValue);
        return next;
      });
      showToast(errorMessage(err), "error");
    }
  }

  function bidderItemsTotal(bidderId: string): number {
    return rfqItems.reduce((sum, item) => {
      const price = quotes.get(quoteKey(item.procurement_item_id, bidderId));
      return sum + (price !== undefined ? price * item.quantity : 0);
    }, 0);
  }

  /** Baseline total cost of the RFQ's procurement items (quantity × estimated
   *  unit cost, before any bids come in) -- what each bidder's Computed Total
   *  gets sized up against. */
  function estimatedItemsTotal(): number {
    return rfqItems.reduce(
      (sum, item) => sum + (item.estimated_unit_cost != null ? item.quantity * item.estimated_unit_cost : 0),
      0,
    );
  }

  async function loadStandardTemplate() {
    if (!canEdit || !selectedRfqId) return;
    setLoadingTemplate(true);
    try {
      const payload = STANDARD_TEMPLATE.map((t) => ({ bidding_id: selectedRfqId, section: t.section, document_name: t.document_name }));
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
    if (!selectedRfq) return;
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
    if (rfqItems.length > 0) {
      lines.push(["", "", ...blankBidderCells, ""]);
      lines.push(["Item Price Quotes", "", ...blankBidderCells, ""]);
      lines.push(["Item", "Qty", ...bidderNames.map(() => "Unit Price"), ""]);
      for (const item of rfqItems) {
        const prices = bidders.map((b) => {
          const v = quotes.get(quoteKey(item.procurement_item_id, b.id));
          return v !== undefined ? String(v) : "";
        });
        lines.push([`${item.code} ${item.description}`.trim(), String(item.quantity), ...prices, ""]);
      }
    }
    const csv = lines.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
    downloadFile(csv, `bid-evaluation-${selectedRfq.code}.csv`);
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
              value={selectedRfqId}
              onChange={(e) => setSelectedRfqId(e.target.value)}
              disabled={loadingRfqs}
            >
              <option value="">{loadingRfqs ? "Loading RFQs…" : "Select an RFQ…"}</option>
              {rfqs.map((r) => {
                const subject = subjectFor(r.requisition_id);
                return (
                  <option key={r.id} value={r.id}>
                    {r.code}
                    {r.title ? ` · ${r.title}` : ""}
                    {subject ? ` — ${subject}` : ""}
                  </option>
                );
              })}
            </select>
            {selectedRfqId && (
              <Button variant="secondary" onClick={exportCsv} disabled={checklistItems.length === 0}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {selectedRfqId && (
        <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, margin: "-0.5rem 0 1rem", color: "var(--on-surface-variant)" }}>
          Subject: <span style={{ fontWeight: 600, color: "var(--on-surface)" }}>
            {subjectFor(selectedRfq?.requisition_id) || "No procurement items attached to this RFQ's requisition yet"}
          </span>
        </p>
      )}

      {!selectedRfqId ? (
        <div className="card" style={{ textAlign: "center", color: "var(--on-surface-variant)" }}>
          Select an RFQ above to open its bid evaluation matrix.
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
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Bid Offer, {selectedRfq?.currency || "PHP"}</td>
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
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Bid Security, {selectedRfq?.currency || "PHP"}</td>
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

          <div className="card" style={{ padding: "1rem", overflowX: "auto", marginTop: "1rem" }}>
            <h4 style={{ margin: "0 0 0.75rem" }}>Item Price Quotes</h4>
            {rfqItems.length === 0 ? (
              <p className="label-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--on-surface-variant)" }}>
                This RFQ&apos;s requisition has no procurement items attached yet. Add them from the Requisition&apos;s own Procurement Items list, and they&apos;ll show up here for pricing.
              </p>
            ) : (
              <div style={{ minWidth: 420 + bidders.length * 130 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th className="label-sm" style={{ textAlign: "left", padding: "0.6rem 0.75rem" }}>Item</th>
                      <th className="label-sm" style={{ textAlign: "right", padding: "0.6rem 0.75rem" }}>Qty</th>
                      <th className="label-sm" style={{ textAlign: "right", padding: "0.6rem 0.75rem" }}>Est. Cost</th>
                      {bidders.map((b) => (
                        <th key={b.id} className="label-sm" style={{ textAlign: "center", padding: "0.6rem 0.5rem" }}>
                          {b.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rfqItems.map((item) => (
                      <tr key={item.procurement_item_id} style={{ borderTop: "1px solid var(--surface-container-high)" }}>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <div style={{ fontWeight: 600 }}>{item.code}</div>
                          <div style={{ color: "var(--on-surface-variant)", fontSize: "0.78rem" }}>{item.description}</div>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                          {item.quantity} {item.unit_of_measure}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "var(--on-surface-variant)" }}>
                          {item.estimated_unit_cost != null ? formatAmount(item.quantity * item.estimated_unit_cost) : "—"}
                        </td>
                        {bidders.map((b) => (
                          <td key={b.id} style={{ padding: "0.4rem 0.5rem" }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="input"
                              style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", textAlign: "right", width: 100 }}
                              defaultValue={formatAmount(quotes.get(quoteKey(item.procurement_item_id, b.id)) ?? null)}
                              disabled={!canEdit}
                              onFocus={(e) => {
                                const v = quotes.get(quoteKey(item.procurement_item_id, b.id));
                                e.target.value = v === undefined ? "" : String(v);
                              }}
                              onBlur={(e) => {
                                const parsed = parseAmount(e.target.value);
                                e.target.value = formatAmount(parsed);
                                const current = quotes.get(quoteKey(item.procurement_item_id, b.id)) ?? null;
                                if (parsed !== current) saveQuote(item.procurement_item_id, b.id, parsed);
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--outline-variant)" }}>
                      <td colSpan={2} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>
                        Estimated Total, {selectedRfq?.currency || "PHP"}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 700 }}>
                        {formatAmount(estimatedItemsTotal())}
                      </td>
                      {bidders.length > 0 && <td colSpan={bidders.length} />}
                    </tr>
                    {bidders.length > 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>
                          Computed Total, {selectedRfq?.currency || "PHP"}
                        </td>
                        {bidders.map((b) => (
                          <td key={b.id} style={{ padding: "0.6rem 0.5rem", textAlign: "right", fontWeight: 700 }}>
                            {formatAmount(bidderItemsTotal(b.id))}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
