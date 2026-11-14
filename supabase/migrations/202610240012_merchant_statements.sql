begin;
-- Establish one atomic capture/backfill boundary before taking any source snapshot.
-- Existing flows lock orders/vouchers in different orders; NOWAIT avoids waiting
-- with a partial lock set. Run in a quiet maintenance window; retry after 55P03.
lock table public.pci_orders,public.pci_vouchers,public.pci_redemptions,public.pci_refunds in access exclusive mode nowait;
create table pci_private.order_statement_terms (
 order_id uuid primary key references public.pci_orders(id),restaurant_id uuid not null references public.pci_restaurants(id),sales_mode text not null check(sales_mode in ('prepaid','pay-at-restaurant')),
 quantity integer not null check(quantity between 1 and 6),purchased_at timestamptz not null,menu_name text not null,
 online_cents integer not null check(online_cents>=0),basis_cents integer,commission_cents integer,commission_vat_cents integer,known boolean not null,
 check(known=(basis_cents is not null and commission_cents is not null and commission_vat_cents is not null)),
 check(basis_cents>=0 and commission_cents>=0 and commission_vat_cents>=0 and commission_cents::bigint+commission_vat_cents<=basis_cents)
);
create table pci_private.statement_events (
 id bigint generated always as identity primary key,event_key text not null unique,order_id uuid not null references pci_private.order_statement_terms(order_id),restaurant_id uuid not null references public.pci_restaurants(id),
 kind text not null check(kind in ('sale','issue','redeem','undo','refund')),occurred_at timestamptz not null,recorded_at timestamptz not null default pci_private.clock_now(),
 quantity integer not null check(quantity between 1 and 6),online_cents bigint not null,commission_cents bigint,commission_vat_cents bigint,
 check((commission_cents is null)=(commission_vat_cents is null))
);
create index on pci_private.statement_events(restaurant_id,occurred_at desc,id desc);
alter table pci_private.order_statement_terms enable row level security;alter table pci_private.statement_events enable row level security;
revoke all on pci_private.order_statement_terms,pci_private.statement_events from public,anon,authenticated,service_role;

-- Historical prepaid amounts are authoritative. Historical onsite rates are not inferable.
insert into pci_private.order_statement_terms(order_id,restaurant_id,sales_mode,quantity,purchased_at,menu_name,online_cents,basis_cents,commission_cents,commission_vat_cents,known)
select o.id,o.restaurant_id,o.sales_mode,o.quantity,o.purchased_at,coalesce(nullif(m.translations->'it'->>'name',''),'[Nome del menù]'),o.unit_amount_cents,
 case when o.sales_mode='prepaid' then o.unit_amount_cents end,case when o.sales_mode='prepaid' then o.unit_commission_cents end,case when o.sales_mode='prepaid' then o.unit_commission_vat_cents end,o.sales_mode='prepaid'
from public.pci_orders o join public.pci_menu_versions m on m.id=o.menu_version_id where o.purchased_at is not null and o.status in ('paid','free-issued','partially-refunded','refunded');
insert into pci_private.statement_events(event_key,order_id,restaurant_id,kind,occurred_at,quantity,online_cents,commission_cents,commission_vat_cents)
select order_id||':issue',order_id,restaurant_id,case when sales_mode='prepaid' then 'sale' else 'issue' end,purchased_at,quantity,quantity::bigint*online_cents,
 case when sales_mode='prepaid' then quantity::bigint*commission_cents else 0 end,case when sales_mode='prepaid' then quantity::bigint*commission_vat_cents else 0 end from pci_private.order_statement_terms;
insert into pci_private.statement_events(event_key,order_id,restaurant_id,kind,occurred_at,quantity,online_cents,commission_cents,commission_vat_cents)
select r.id||':redeem',t.order_id,t.restaurant_id,'redeem',coalesce(r.served_at,r.redeemed_at),1,0,case when t.sales_mode='prepaid' then 0 else t.commission_cents end,case when t.sales_mode='prepaid' then 0 else t.commission_vat_cents end
from public.pci_redemptions r join public.pci_vouchers v on v.id=r.voucher_id join pci_private.order_statement_terms t on t.order_id=v.order_id;
insert into pci_private.statement_events(event_key,order_id,restaurant_id,kind,occurred_at,quantity,online_cents,commission_cents,commission_vat_cents)
select r.id||':undo',t.order_id,t.restaurant_id,'undo',r.voided_at,1,0,case when t.sales_mode='prepaid' then 0 else -t.commission_cents end,case when t.sales_mode='prepaid' then 0 else -t.commission_vat_cents end
from public.pci_redemptions r join public.pci_vouchers v on v.id=r.voucher_id join pci_private.order_statement_terms t on t.order_id=v.order_id where r.voided_at is not null;
insert into pci_private.statement_events(event_key,order_id,restaurant_id,kind,occurred_at,quantity,online_cents,commission_cents,commission_vat_cents)
select r.id||':refund',t.order_id,t.restaurant_id,'refund',r.completed_at,1,-r.amount_cents::bigint,-r.commission_refund_cents::bigint,-r.commission_vat_refund_cents::bigint
from public.pci_refunds r join pci_private.order_statement_terms t on t.order_id=r.order_id where r.status='succeeded';

create function pci_private.statement_append(p_key text,p_order uuid,p_kind text,p_at timestamptz,p_quantity integer,p_online bigint,p_commission bigint,p_vat bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 -- IDs are allocated only under this transaction lock. A reader's watermark cannot include an uncommitted older ID.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('statement-journal',0));
 insert into pci_private.statement_events(event_key,order_id,restaurant_id,kind,occurred_at,quantity,online_cents,commission_cents,commission_vat_cents)
 select p_key,t.order_id,t.restaurant_id,p_kind,p_at,p_quantity,p_online,p_commission,p_vat from pci_private.order_statement_terms t where t.order_id=p_order on conflict(event_key) do nothing;
 if not exists(select 1 from pci_private.order_statement_terms where order_id=p_order) then raise exception 'Missing statement terms' using errcode='23514';end if;
end $$;
create function pci_private.capture_statement_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.pci_menu_versions;s pci_private.restaurant_settings;basis integer;fee integer;vat integer;
begin
 if new.purchased_at is null or new.status not in ('paid','free-issued','partially-refunded','refunded') or exists(select 1 from pci_private.order_statement_terms where order_id=new.id) then return new;end if;
 select * into m from public.pci_menu_versions where id=new.menu_version_id and restaurant_id=new.restaurant_id and sales_mode=new.sales_mode;
 if not found then raise exception 'Order/menu mode mismatch' using errcode='23514';end if;
 if new.sales_mode='prepaid' then basis=new.unit_amount_cents;fee=new.unit_commission_cents;vat=new.unit_commission_vat_cents;
 else
  select * into s from pci_private.restaurant_settings where restaurant_id=new.restaurant_id for share;
  if not found then raise exception 'Missing negotiated terms' using errcode='23514';end if;
  basis=m.price_cents;fee=case when (new.purchased_at at time zone 'Europe/Rome')::date between s.trial_start and s.trial_end then 0 else (basis::bigint*s.commission_bps+5000)/10000 end;vat=(fee::bigint*s.commission_vat_bps+5000)/10000;
 end if;
 insert into pci_private.order_statement_terms values(new.id,new.restaurant_id,new.sales_mode,new.quantity,new.purchased_at,coalesce(nullif(m.translations->'it'->>'name',''),'[Nome del menù]'),new.unit_amount_cents,basis,fee,vat,true);
 perform pci_private.statement_append(new.id||':issue',new.id,case when new.sales_mode='prepaid' then 'sale' else 'issue' end,new.purchased_at,new.quantity,new.quantity::bigint*new.unit_amount_cents,case when new.sales_mode='prepaid' then new.quantity::bigint*fee else 0 end,case when new.sales_mode='prepaid' then new.quantity::bigint*vat else 0 end);
 return new;
end $$;
create function pci_private.protect_statement_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from pci_private.order_statement_terms where order_id=old.id) and row(new.id,new.restaurant_id,new.menu_version_id,new.quantity,new.sales_mode,new.unit_amount_cents,new.unit_commission_cents,new.unit_commission_vat_cents,new.purchased_at) is distinct from row(old.id,old.restaurant_id,old.menu_version_id,old.quantity,old.sales_mode,old.unit_amount_cents,old.unit_commission_cents,old.unit_commission_vat_cents,old.purchased_at) then raise exception 'Settled order financial facts are immutable' using errcode='23514';end if;return new;
end $$;
create trigger pci_statement_order_guard before update on public.pci_orders for each row execute function pci_private.protect_statement_order();
create trigger pci_statement_order_capture after insert or update on public.pci_orders for each row execute function pci_private.capture_statement_terms();
create function pci_private.capture_statement_redemption() returns trigger language plpgsql security definer set search_path='' as $$
declare t pci_private.order_statement_terms;
begin
 select t0.* into t from pci_private.order_statement_terms t0 join public.pci_vouchers v on v.order_id=t0.order_id where v.id=new.voucher_id;
 if tg_op='UPDATE' and row(new.id,new.voucher_id,new.restaurant_id,new.redeemed_at,new.served_at) is distinct from row(old.id,old.voucher_id,old.restaurant_id,old.redeemed_at,old.served_at) then raise exception 'Redemption financial facts are immutable' using errcode='23514';end if;
 if tg_op='INSERT' then perform pci_private.statement_append(new.id||':redeem',t.order_id,'redeem',coalesce(new.served_at,new.redeemed_at),1,0,case when t.sales_mode='prepaid' then 0 else t.commission_cents end,case when t.sales_mode='prepaid' then 0 else t.commission_vat_cents end);
 elsif new.voided_at is distinct from old.voided_at then
  if old.voided_at is not null or new.voided_at is null then raise exception 'Undo time is immutable' using errcode='23514';end if;
  perform pci_private.statement_append(new.id||':undo',t.order_id,'undo',new.voided_at,1,0,case when t.sales_mode='prepaid' then 0 else -t.commission_cents end,case when t.sales_mode='prepaid' then 0 else -t.commission_vat_cents end);
 end if;return new;
end $$;
create trigger pci_statement_redemption after insert or update on public.pci_redemptions for each row execute function pci_private.capture_statement_redemption();
create function pci_private.capture_statement_refund() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.status='succeeded' and row(new.id,new.order_id,new.voucher_id,new.restaurant_id,new.status,new.completed_at,new.amount_cents,new.commission_refund_cents,new.commission_vat_refund_cents) is distinct from row(old.id,old.order_id,old.voucher_id,old.restaurant_id,old.status,old.completed_at,old.amount_cents,old.commission_refund_cents,old.commission_vat_refund_cents) then raise exception 'Completed refund financial facts are immutable' using errcode='23514';end if;
 if new.status='succeeded' then perform pci_private.statement_append(new.id||':refund',new.order_id,'refund',new.completed_at,1,-new.amount_cents::bigint,-new.commission_refund_cents::bigint,-new.commission_vat_refund_cents::bigint);end if;return new;
end $$;
create trigger pci_statement_refund after insert or update on public.pci_refunds for each row execute function pci_private.capture_statement_refund();
create function pci_private.reject_statement_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Statement facts are append-only' using errcode='23514';end$$;
create trigger pci_statement_terms_immutable before update or delete on pci_private.order_statement_terms for each row execute function pci_private.reject_statement_mutation();
create trigger pci_statement_events_immutable before update or delete on pci_private.statement_events for each row execute function pci_private.reject_statement_mutation();

create function public.pci_merchant_statement(p_restaurant uuid default null,p_month text default null,p_watermark text default null,p_cursor text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare restaurants jsonb;restaurant uuid;month text;start_at timestamptz;end_at timestamptz;watermark bigint;cursor_id bigint;cursor_at timestamptz;rows jsonb;totals jsonb;next_cursor text;
begin
 if auth.uid() is null or pci_private.merchant_session() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 month=coalesce(p_month,to_char(pci_private.clock_now() at time zone 'Europe/Rome','YYYY-MM'));
 if month !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' or p_watermark is not null and (p_watermark !~ '^(0|[1-9][0-9]{0,18})$' or p_watermark::numeric>9223372036854775807) or p_cursor is not null and (p_watermark is null or p_cursor !~ '^[1-9][0-9]{0,18}$' or p_cursor::numeric>9223372036854775807) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name,r.id) into restaurants from public.pci_restaurants r where pci_private.merchant_owner_allowed(r.id);
 if restaurants is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 restaurant=coalesce(p_restaurant,(restaurants->0->>'id')::uuid);if not pci_private.lock_merchant_owner(restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('statement-journal',0));
 select coalesce(max(id),0) into watermark from pci_private.statement_events;
 if p_watermark is not null then if p_watermark::bigint>watermark then return jsonb_build_object('ok',false,'code','invalid_request');end if;watermark=p_watermark::bigint;end if;
 start_at=(month||'-01')::date::timestamp at time zone 'Europe/Rome';end_at=((month||'-01')::date+interval '1 month')::timestamp at time zone 'Europe/Rome';
 if p_cursor is not null then cursor_id=p_cursor::bigint;select occurred_at into cursor_at from pci_private.statement_events where id=cursor_id and restaurant_id=restaurant and occurred_at>=start_at and occurred_at<end_at and id<=watermark;if not found then return jsonb_build_object('ok',false,'code','invalid_request');end if;end if;
 select jsonb_build_object('sold',coalesce(sum(quantity) filter(where kind='sale'),0)::text,'issued',coalesce(sum(quantity) filter(where kind='issue'),0)::text,'redeemed',coalesce(sum(quantity) filter(where kind='redeem'),0)::text,'undone',coalesce(sum(quantity) filter(where kind='undo'),0)::text,'refunded',coalesce(sum(quantity) filter(where kind='refund'),0)::text,'onlineCents',coalesce(sum(online_cents),0)::text,'commissionCents',case when count(*) filter(where commission_cents is null)>0 then null else coalesce(sum(commission_cents),0)::text end,'commissionVatCents',case when count(*) filter(where commission_vat_cents is null)>0 then null else coalesce(sum(commission_vat_cents),0)::text end,'unknown',count(*) filter(where commission_cents is null)::text) into totals from pci_private.statement_events where restaurant_id=restaurant and occurred_at>=start_at and occurred_at<end_at and id<=watermark;
 with page as(select e.*,t.menu_name,t.sales_mode from pci_private.statement_events e join pci_private.order_statement_terms t on t.order_id=e.order_id where e.restaurant_id=restaurant and e.occurred_at>=start_at and e.occurred_at<end_at and e.id<=watermark and (p_cursor is null or (e.occurred_at,e.id)<(cursor_at,cursor_id)) order by e.occurred_at desc,e.id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,'occurredAt',occurred_at,'recordedAt',recorded_at,'menu',menu_name,'salesMode',sales_mode,'quantity',quantity,'onlineCents',online_cents::text,'commissionCents',commission_cents::text,'commissionVatCents',commission_vat_cents::text) order by occurred_at desc,id desc),'[]') into rows from page;
 if jsonb_array_length(rows)>50 then rows=rows-50;next_cursor=rows->49->>'id';end if;
 return jsonb_build_object('ok',true,'serverNow',pci_private.clock_now(),'restaurantId',restaurant,'restaurants',restaurants,'month',month,'watermark',watermark::text,'totals',totals,'rows',rows,'nextCursor',next_cursor,'reconciliation','unverified');
end $$;
revoke all on function pci_private.statement_append(text,uuid,text,timestamptz,integer,bigint,bigint,bigint),pci_private.capture_statement_terms(),pci_private.protect_statement_order(),pci_private.capture_statement_redemption(),pci_private.capture_statement_refund(),pci_private.reject_statement_mutation(),public.pci_merchant_statement(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_merchant_statement(uuid,text,text,text) to authenticated;
commit;
