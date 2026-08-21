-- Per the user's own framing: a Purchase Requisition's whole job is being
-- the approval gate -- "purchased request is just a[n] approval, is the
-- main important [thing]". Trims the record down to that: who's asking
-- (Requested By, Department), the decision (Status), and the decision
-- trail (Approved By + the new Approved Date). Drops Requisition Date and
-- Required By, which were more about scheduling/logistics than the
-- approval itself -- `created_at` (already shown in the edit modal header)
-- covers "when this was raised" well enough without a duplicate field.
alter table public.purchase_requisitions
  add column approved_date date;

alter table public.purchase_requisitions
  drop column if exists requisition_date,
  drop column if exists required_by_date;
