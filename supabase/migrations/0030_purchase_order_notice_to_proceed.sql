-- Notice to Proceed (NTP): the formal go-ahead issued after a PO/contract is
-- signed, authorizing the supplier/contractor to start delivery or
-- mobilization -- a standard stage in RA 9184-style procurement that wasn't
-- modeled anywhere yet (purchase_order_status only had Issued -> Acknowledged
-- -> Partially Received -> ... with nothing between "signed" and "delivery
-- starts"). Tracked two ways, mirroring how order_date/expected_delivery_date
-- already work:
--
-- 1. An actual date column -- contract durations and delay tracking are
--    often counted from the date NTP was *received*, so it needs to be a
--    real value, not just a status label.
alter table public.purchase_orders add column ntp_date date;

-- 2. A lifecycle status value, so a PO's overall status_id can reflect NTP
--    having been issued, same as every other stage. Inserted between
--    Acknowledged and Partially Received conceptually (code POST-0009 --
--    dropdown order in the app is by created_at, not code, so the gap in
--    numbering doesn't affect display order).
insert into public.lookup_options (list_key, code, value, owner_id)
select 'purchase_order_status', 'POST-0009', 'Notice to Proceed', (select id from auth.users order by created_at asc limit 1)
where not exists (select 1 from public.lookup_options lo where lo.list_key = 'purchase_order_status' and lo.value = 'Notice to Proceed')
  and exists (select 1 from auth.users);
