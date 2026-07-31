-- ============================================================
-- Beymen POS — diagnostics for the 26/07 reports.
-- READ-ONLY. Run each block on its own in the Supabase SQL Editor.
--
--   A. the phantom item on a kitchen ticket (S15 / "Lokum")
--   B. "paiements à venir" showing 1800 DH with one open table (Iberia)
--   C. reconciling the 26th's revenue against the till (Iberia)
--
-- The service day runs 05:00 → 05:00, so "the 26th" means
-- 2026-07-26 05:00 → 2026-07-27 05:00, Africa/Casablanca.
-- ============================================================
set search_path = public, extensions;

-- Table ids ("TER-1") are meaningless to a human — this resolves the label.
create or replace function _dx_labels(ids text[]) returns text
language sql stable as $$
  select string_agg(coalesce(t.label, i), '+' order by ord)
  from unnest(ids) with ordinality as u(i, ord)
  left join restaurant_tables t on t.id = u.i;
$$;


-- ============================================================
-- A. THE PHANTOM ITEM ON A KITCHEN TICKET
-- ============================================================

-- A1. Every line that printed AFTER its own table was already closed.
-- This is the mechanism the code fix targets: a line queued while a printer
-- was down stayed eligible forever, and flushed out later riding on whatever
-- ticket happened to trigger the next print pass. Its session is closed, so
-- the app shows it nowhere — "it was on the receipt but never in the system".
select
  oi.name,
  oi.qty,
  oi.ticket_no,
  _dx_labels(ts.table_ids)          as tables,
  ts.branch,
  oi.created_at                     as ordered_at,
  ts.closed_at                      as table_closed_at,
  oi.printed_at,
  oi.printed_at - ts.closed_at      as printed_this_long_after_closing
from order_items oi
join table_sessions ts on ts.id = oi.session_id
where oi.ticket_no is not null
  and oi.voided = false
  and ts.closed_at is not null
  and oi.printed_at > ts.closed_at
order by oi.printed_at desc
limit 100;

-- A2. Still-queued lines on tables that are already closed — the backlog
-- that WOULD have printed next. After deploying the fix these can never
-- print; this is what was sitting in the queue.
select
  oi.name, oi.qty, oi.ticket_no,
  _dx_labels(ts.table_ids) as tables, ts.branch,
  oi.created_at as ordered_at, ts.closed_at as table_closed_at
from order_items oi
join table_sessions ts on ts.id = oi.session_id
where oi.ticket_no is not null
  and oi.printed_at is null
  and oi.voided = false
  and ts.closed_at is not null
order by oi.created_at desc
limit 100;

-- A3. The specific item, whatever its history. Change the name to taste.
select
  oi.id, oi.name, oi.qty, oi.price,
  oi.ticket_no, oi.created_at, oi.printed_at, oi.voided,
  _dx_labels(ts.table_ids) as tables,
  ts.branch, ts.seated_at, ts.closed_at, ts.cancelled
from order_items oi
join table_sessions ts on ts.id = oi.session_id
where oi.name ilike '%lokum%'
order by oi.created_at desc
limit 50;

-- A4. Everything that touched table S15 in the last 3 days, in order —
-- the full story: which session, which ticket, when it printed.
select
  ts.id as session_id,
  _dx_labels(ts.table_ids) as tables,
  ts.seated_at, ts.closed_at, ts.cancelled, ts.ticket_seq,
  oi.name, oi.qty, oi.ticket_no, oi.created_at, oi.printed_at, oi.voided
from table_sessions ts
join order_items oi on oi.session_id = ts.id
where exists (
  select 1 from unnest(ts.table_ids) tid
  join restaurant_tables rt on rt.id = tid
  where rt.label = 'S15'
)
  and ts.seated_at > now() - interval '3 days'
order by ts.seated_at desc, oi.created_at;

-- A5. Two open sessions on the SAME physical table. The floor map only ever
-- renders the first, so the second is invisible while its tickets still
-- print and its balance still counts. Should always return zero rows.
select
  a.id as session_a, b.id as session_b, tid as shared_table,
  a.branch, a.seated_at as a_seated, b.seated_at as b_seated
from table_sessions a
join table_sessions b
  on b.id > a.id
 and b.closed_at is null
 and a.table_ids && b.table_ids
cross join lateral unnest(a.table_ids) tid
where a.closed_at is null
  and tid = any(b.table_ids);


-- ============================================================
-- B. "PAIEMENTS À VENIR" — 1800 DH FOR ONE OPEN TABLE (IBERIA)
-- ============================================================

-- B1. Every open Iberia table with what the card counts for it. The figure
-- is live and NOT period-scoped, so a table left unfreed days ago keeps
-- inflating it forever. `days_open` is the giveaway.
select
  _dx_labels(ts.table_ids)                        as tables,
  ts.seated_at,
  round(extract(epoch from now() - ts.seated_at) / 86400, 1) as days_open,
  ts.status, ts.locked, ts.cancel_requested,
  ts.discount,
  f.name                                          as friend,
  (fd.id is not null)                             as tab_already_booked,
  coalesce(g.gross, 0)                            as gross,
  round(coalesce(g.gross, 0) * (1 - coalesce(ts.discount, 0) / 100.0), 2) as due,
  coalesce(p.paid, 0)                             as paid,
  round(coalesce(g.gross, 0) * (1 - coalesce(ts.discount, 0) / 100.0)
        - coalesce(p.paid, 0), 2)                 as counted_as_upcoming
from table_sessions ts
left join lateral (
  select sum(i.price * i.qty) as gross
  from order_items i where i.session_id = ts.id and i.voided = false
) g on true
left join lateral (
  select sum(pay.amount) as paid from payments pay where pay.session_id = ts.id
) p on true
left join friends f on f.id = ts.friend_id
left join friend_debts fd on fd.session_id = ts.id
where ts.closed_at is null
  and ts.branch = 'iberia'
order by counted_as_upcoming desc nulls last;

-- B2. The same total, split into "real" vs the two things that shouldn't be
-- there: friend tabs already booked as a receivable (double-counted — fixed
-- in the app), and tables left open from an earlier service day.
select
  case
    when ts.friend_id is not null and fd.id is not null then 'friend tab already booked'
    when ts.seated_at < now() - interval '12 hours' then 'stale — left open, earlier service'
    else 'genuinely open now'
  end as bucket,
  count(*) as tables,
  round(sum(coalesce(g.gross, 0) * (1 - coalesce(ts.discount, 0) / 100.0)
            - coalesce(p.paid, 0)), 2) as amount
from table_sessions ts
left join lateral (
  select sum(i.price * i.qty) as gross
  from order_items i where i.session_id = ts.id and i.voided = false
) g on true
left join lateral (
  select sum(pay.amount) as paid from payments pay where pay.session_id = ts.id
) p on true
left join friend_debts fd on fd.session_id = ts.id
where ts.closed_at is null and ts.branch = 'iberia'
group by 1
order by amount desc;

-- B3. Open sessions pointing at a table that doesn't exist (or belongs to
-- the other branch). These render NOWHERE on the floor map but still count.
select ts.id, ts.branch, ts.table_ids, ts.seated_at, ts.status
from table_sessions ts
where ts.closed_at is null
  and exists (
    select 1 from unnest(ts.table_ids) tid
    where not exists (
      select 1 from restaurant_tables rt
      where rt.id = tid and rt.branch = ts.branch
    )
  );


-- ============================================================
-- C. THE 26th's REVENUE (IBERIA) — TILL SAYS 500 DH LESS
-- ============================================================

-- C0. The window every block below uses.
--   from 2026-07-26 05:00  to 2026-07-27 05:00  (Africa/Casablanca)

-- C1. The headline, exactly as the Analytics card computes it: money
-- COLLECTED on sessions closed in the window, staff meals excluded,
-- cancelled excluded. cash + card = revenue by construction.
select
  pay.method,
  count(*)          as payments,
  sum(pay.amount)   as total
from table_sessions ts
join payments pay on pay.session_id = ts.id
where ts.branch = 'iberia'
  and ts.cancelled = false
  and ts.closed_at >= timestamptz '2026-07-26 05:00 Africa/Casablanca'
  and ts.closed_at <  timestamptz '2026-07-27 05:00 Africa/Casablanca'
  and coalesce(ts.staff_order, false) = false
group by rollup (pay.method)
order by pay.method nulls last;

-- C2. THE PRIME SUSPECT: tables that collected MORE than they were billed.
-- A 500 DH gap of "system says more than the drawer holds" is almost always
-- one bill paid twice. Anything with over_collected > 0.5 is money the
-- system counted that never entered the till.
select
  _dx_labels(ts.table_ids) as tables,
  ts.closed_at,
  round(g.gross, 2)                                              as gross,
  ts.discount,
  round(g.gross * (1 - coalesce(ts.discount, 0) / 100.0), 2)     as net_bill,
  round(p.paid, 2)                                               as collected,
  round(p.paid - g.gross * (1 - coalesce(ts.discount, 0) / 100.0), 2) as over_collected,
  p.n_payments
from table_sessions ts
join lateral (
  select coalesce(sum(i.price * i.qty), 0) as gross
  from order_items i where i.session_id = ts.id and i.voided = false
) g on true
join lateral (
  select coalesce(sum(pay.amount), 0) as paid, count(*) as n_payments
  from payments pay where pay.session_id = ts.id
) p on true
where ts.branch = 'iberia'
  and ts.cancelled = false
  and ts.closed_at >= timestamptz '2026-07-26 05:00 Africa/Casablanca'
  and ts.closed_at <  timestamptz '2026-07-27 05:00 Africa/Casablanca'
  and p.paid - g.gross * (1 - coalesce(ts.discount, 0) / 100.0) > 0.5
order by over_collected desc;

-- C3. Near-identical payments on the same table within 5 minutes — the
-- double-tap signature. The trg_dedup_full_payment trigger blocks kind
-- 'full', but a till running an older bundle, or a split/by-item payment
-- (deliberately exempt), can still land twice.
select
  _dx_labels(ts.table_ids) as tables,
  a.kind, a.method, a.amount,
  a.created_at as first_at,
  b.created_at as second_at,
  b.created_at - a.created_at as apart
from payments a
join payments b
  on b.session_id = a.session_id
 and b.id > a.id
 and b.amount = a.amount
 and b.created_at between a.created_at and a.created_at + interval '5 minutes'
join table_sessions ts on ts.id = a.session_id
where ts.branch = 'iberia'
  and a.created_at >= timestamptz '2026-07-26 05:00 Africa/Casablanca'
  and a.created_at <  timestamptz '2026-07-27 05:00 Africa/Casablanca'
order by a.created_at;

-- C4. Every payment of the day, table by table, to eyeball against the
-- drawer. `running_total` should end on the C1 figure.
select
  pay.created_at,
  _dx_labels(ts.table_ids) as tables,
  s.name                   as cashier,
  pay.method, pay.kind, pay.amount,
  sum(pay.amount) over (order by pay.created_at, pay.id) as running_total
from payments pay
join table_sessions ts on ts.id = pay.session_id
left join staff s on s.id = pay.cashier_id
where ts.branch = 'iberia'
  and ts.cancelled = false
  and coalesce(ts.staff_order, false) = false
  and pay.created_at >= timestamptz '2026-07-26 05:00 Africa/Casablanca'
  and pay.created_at <  timestamptz '2026-07-27 05:00 Africa/Casablanca'
order by pay.created_at;

-- C5. A payment recorded on a session that CLOSED outside the window (or is
-- still open) is counted on a different day than the cash was taken. If C1
-- and C4 disagree, this is why.
select
  _dx_labels(ts.table_ids) as tables,
  pay.created_at as paid_at, ts.closed_at, pay.method, pay.amount
from payments pay
join table_sessions ts on ts.id = pay.session_id
where ts.branch = 'iberia'
  and pay.created_at >= timestamptz '2026-07-26 05:00 Africa/Casablanca'
  and pay.created_at <  timestamptz '2026-07-27 05:00 Africa/Casablanca'
  and (
    ts.closed_at is null
    or ts.closed_at <  timestamptz '2026-07-26 05:00 Africa/Casablanca'
    or ts.closed_at >= timestamptz '2026-07-27 05:00 Africa/Casablanca'
  )
order by pay.created_at;

-- C6. Voids and removals during the day — the other way the drawer ends up
-- short: food that went out, got voided off the bill, and was never paid.
select
  l.at, s.name as who, l.action, l.table_ref, l.detail
from activity_log l
left join staff s on s.id = l.staff_id
where l.branch = 'iberia'
  and l.action in ('void_item', 'remove_items', 'discount', 'cancel_table', 'reopen_table')
  and l.at >= timestamptz '2026-07-26 05:00 Africa/Casablanca'
  and l.at <  timestamptz '2026-07-27 05:00 Africa/Casablanca'
order by l.at;


-- Tidy up the helper when you're done.
-- drop function _dx_labels(text[]);
