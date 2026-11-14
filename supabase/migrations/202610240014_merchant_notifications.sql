begin;
-- Quiet maintenance boundary: never hold partial DDL locks while waiting on business writers.
lock table public.pci_restaurants,pci_private.management_operations,pci_private.statement_events,pci_private.notification_queue in access exclusive mode nowait;
create table pci_private.merchant_report_cursors (
 restaurant_id uuid primary key references public.pci_restaurants(id),daily_next date not null,weekly_next date not null check(extract(isodow from weekly_next)=1)
);
create table pci_private.merchant_withdrawal_activity (
 operation_id uuid primary key references pci_private.management_operations(id),restaurant_id uuid not null references public.pci_restaurants(id),
 menu text not null,amount_cents bigint not null check(amount_cents>=0),occurred_at timestamptz not null,recorded_at timestamptz not null default pci_private.clock_now()
);
create index on pci_private.merchant_withdrawal_activity(restaurant_id,recorded_at);
create index on pci_private.statement_events(restaurant_id,recorded_at,id);
create table pci_private.merchant_reports (
 id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.pci_restaurants(id),kind text not null check(kind in ('merchant-daily','merchant-weekly')),
 period_start date not null,period_end date not null,from_at timestamptz not null,until_at timestamptz not null,captured_at timestamptz not null,
 row_count bigint not null check(row_count>=0),body jsonb,body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 unique(restaurant_id,kind,period_start),check(period_end=period_start+case when kind='merchant-daily' then 1 else 7 end),check(until_at>from_at),check((body is null)=(row_count>1000))
);
alter table pci_private.merchant_report_cursors enable row level security;alter table pci_private.merchant_withdrawal_activity enable row level security;alter table pci_private.merchant_reports enable row level security;
revoke all on pci_private.merchant_report_cursors,pci_private.merchant_withdrawal_activity,pci_private.merchant_reports from public,anon,authenticated,service_role;
create trigger pci_merchant_report_immutable before update or delete on pci_private.merchant_reports for each row execute function pci_private.reject_statement_mutation();
create trigger pci_merchant_withdrawal_immutable before update or delete on pci_private.merchant_withdrawal_activity for each row execute function pci_private.reject_statement_mutation();
create function pci_private.init_merchant_report_cursor() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into pci_private.merchant_report_cursors values(new.id,pci_private.rome_today(),date_trunc('week',pci_private.clock_now() at time zone 'Europe/Rome')::date);return new;end $$;
insert into pci_private.merchant_report_cursors select id,pci_private.rome_today(),date_trunc('week',pci_private.clock_now() at time zone 'Europe/Rome')::date from public.pci_restaurants;
create trigger pci_merchant_report_cursor after insert on public.pci_restaurants for each row execute function pci_private.init_merchant_report_cursor();
create function pci_private.capture_merchant_withdrawal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.purpose='withdrawal' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('statement-journal',0));
  insert into pci_private.merchant_withdrawal_activity(operation_id,restaurant_id,menu,amount_cents,occurred_at)
  select new.id,t.restaurant_id,t.menu_name,f.amount_cents,new.completed_at from public.pci_refunds f join pci_private.order_statement_terms t on t.order_id=f.order_id where f.id=new.refund_id;
  if not found then raise exception 'Missing withdrawal report facts' using errcode='23514';end if;
 end if;return new;
end $$;
-- Historical requests retain their known occurrence time; no historical email backfill cursor.
insert into pci_private.merchant_withdrawal_activity
 select m.id,t.restaurant_id,t.menu_name,f.amount_cents,m.completed_at,m.completed_at from pci_private.management_operations m join public.pci_refunds f on f.id=m.refund_id join pci_private.order_statement_terms t on t.order_id=f.order_id where m.purpose='withdrawal';
create trigger pci_merchant_withdrawal_capture after insert on pci_private.management_operations for each row execute function pci_private.capture_merchant_withdrawal();

create function public.pci_queue_merchant_reports() returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.merchant_report_cursors;today date=pci_private.rome_today();period_start date;period_end date;kind text;from_at timestamptz;until_at timestamptz;captured timestamptz;
 rows jsonb;withdrawals jsonb;totals jsonb;body jsonb;row_count bigint;report_id uuid;queued integer=0;
begin
 select * into c from pci_private.merchant_report_cursors
 where daily_next<today or weekly_next+7<=today
 order by least(case when daily_next<today then daily_next+1 else 'infinity'::date end,case when weekly_next+7<=today then weekly_next+7 else 'infinity'::date end),restaurant_id
 for update skip locked limit 1;
 if not found then return jsonb_build_object('ok',true,'periods',0,'queued',0,'overflow',0);end if;
 if c.daily_next<today and (c.weekly_next+7>today or c.daily_next+1<=c.weekly_next+7) then kind='merchant-daily';period_start=c.daily_next;period_end=period_start+1;
 else kind='merchant-weekly';period_start=c.weekly_next;period_end=period_start+7;end if;
 -- All statement/activity IDs and recording times are committed before this snapshot.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('statement-journal',0));
 captured=pci_private.clock_now();from_at=period_start::timestamp at time zone 'Europe/Rome';until_at=period_end::timestamp at time zone 'Europe/Rome';
 select (select count(*) from pci_private.statement_events e where e.restaurant_id=c.restaurant_id and e.recorded_at>=from_at and e.recorded_at<until_at)+(select count(*) from pci_private.merchant_withdrawal_activity a where a.restaurant_id=c.restaurant_id and a.recorded_at>=from_at and a.recorded_at<until_at) into row_count;
 if row_count<=1000 then
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'kind',e.kind,'occurredAt',e.occurred_at,'recordedAt',e.recorded_at,'menu',t.menu_name,'salesMode',t.sales_mode,'quantity',e.quantity,'onlineCents',e.online_cents::text,'commissionCents',e.commission_cents::text,'commissionVatCents',e.commission_vat_cents::text) order by e.recorded_at,e.id),'[]') into rows from pci_private.statement_events e join pci_private.order_statement_terms t on t.order_id=e.order_id where e.restaurant_id=c.restaurant_id and e.recorded_at>=from_at and e.recorded_at<until_at;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.operation_id,'menu',a.menu,'amountCents',a.amount_cents::text,'occurredAt',a.occurred_at,'recordedAt',a.recorded_at) order by a.recorded_at,a.operation_id),'[]') into withdrawals from pci_private.merchant_withdrawal_activity a where a.restaurant_id=c.restaurant_id and a.recorded_at>=from_at and a.recorded_at<until_at;
  select jsonb_build_object('sold',coalesce(sum(quantity) filter(where e.kind='sale'),0)::text,'issued',coalesce(sum(quantity) filter(where e.kind='issue'),0)::text,'redeemed',coalesce(sum(quantity) filter(where e.kind='redeem'),0)::text,'undone',coalesce(sum(quantity) filter(where e.kind='undo'),0)::text,'refunded',coalesce(sum(quantity) filter(where e.kind='refund'),0)::text,'onlineCents',coalesce(sum(online_cents),0)::text,'commissionCents',case when count(*) filter(where commission_cents is null)>0 then null else coalesce(sum(commission_cents),0)::text end,'commissionVatCents',case when count(*) filter(where commission_vat_cents is null)>0 then null else coalesce(sum(commission_vat_cents),0)::text end,'unknown',count(*) filter(where commission_cents is null)::text) into totals from pci_private.statement_events e where e.restaurant_id=c.restaurant_id and e.recorded_at>=from_at and e.recorded_at<until_at;
  body=jsonb_build_object('rows',rows,'withdrawals',withdrawals,'totals',totals,'reconciliation','unverified');
 end if;
 insert into pci_private.merchant_reports(restaurant_id,kind,period_start,period_end,from_at,until_at,captured_at,row_count,body,body_hash)
 values(c.restaurant_id,kind,period_start,period_end,from_at,until_at,captured,row_count,body,encode(extensions.digest(coalesce(body::text,'overflow:'||row_count::text),'sha256'),'hex')) returning id into report_id;
 if row_count>0 or kind='merchant-weekly' then
  insert into pci_private.notification_queue(kind,dedup_key,language,payload)
  select kind,'merchant-report:'||report_id::text||':'||m.user_id::text,'it',jsonb_build_object('report_id',report_id,'owner_id',m.user_id)
  from public.pci_restaurant_members m join auth.users u on u.id=m.user_id where m.restaurant_id=c.restaurant_id and m.active and m.role='owner' and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null on conflict(dedup_key) do nothing;
  get diagnostics queued=row_count;
 end if;
 update pci_private.merchant_report_cursors set daily_next=case when kind='merchant-daily' then period_end else daily_next end,weekly_next=case when kind='merchant-weekly' then period_end else weekly_next end where restaurant_id=c.restaurant_id;
 return jsonb_build_object('ok',true,'periods',1,'queued',queued,'overflow',case when body is null then 1 else 0 end);
end $$;

alter function pci_private.notification_facts(uuid) rename to purchaser_notification_facts;
create function pci_private.notification_facts(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;r pci_private.merchant_reports;recipient text;restaurant text;
begin
 select * into q from pci_private.notification_queue where id=p_id;
 if q.kind not in ('merchant-daily','merchant-weekly') then return pci_private.purchaser_notification_facts(p_id);end if;
 select * into r from pci_private.merchant_reports where id::text=q.payload->>'report_id' and kind=q.kind;
 if r.id is null or r.body is null then return null;end if;
 select lower(btrim(u.email)) into recipient from public.pci_restaurant_members m join auth.users u on u.id=m.user_id where m.restaurant_id=r.restaurant_id and m.user_id::text=q.payload->>'owner_id' and m.active and m.role='owner' and u.email_confirmed_at is not null;
 if recipient is null then return null;end if;
 select name into restaurant from public.pci_restaurants where id=r.restaurant_id;
 return r.body||jsonb_build_object('kind',r.kind,'reportId',r.id,'reportHash',r.body_hash,'ownerId',q.payload->>'owner_id','restaurantId',r.restaurant_id,'restaurant',restaurant,'recipient',recipient,'language','it','periodStart',r.period_start,'periodEnd',r.period_end,'fromAt',r.from_at,'untilAt',r.until_at,'sourceAsOf',r.captured_at);
end $$;
create or replace function pci_private.notification_source_hash(p_facts jsonb) returns text language sql immutable set search_path='' as $$
 select case when p_facts is null then null when p_facts->>'kind' in ('merchant-daily','merchant-weekly') then encode(extensions.digest(concat_ws(chr(10),p_facts->>'recipient',p_facts->>'kind',p_facts->>'restaurantId',p_facts->>'ownerId',p_facts->>'reportId',p_facts->>'language',p_facts->>'reportHash'),'sha256'),'hex')
 else encode(extensions.digest(concat_ws(chr(10),p_facts->>'recipient',p_facts->>'kind',p_facts->>'orderId',coalesce(p_facts->>'voucherId',''),p_facts->>'language',coalesce(p_facts->'capability'->>'tokenHash','')),'sha256'),'hex') end
$$;
create function public.pci_claim_merchant_notification(p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;d pci_private.notification_deliveries;facts jsonb;now_at timestamptz=pci_private.clock_now();
begin
 if p_lease is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 update pci_private.notification_queue set status='failed',held_at=now_at,last_error='window_expired',lease_id=null,lease_until=null where kind in ('merchant-daily','merchant-weekly') and status in ('pending','processing','failed') and provider_id is null and held_at is null and first_dispatch_at is not null and first_dispatch_at<=now_at-interval '23 hours';
 update pci_private.notification_queue set status='failed',held_at=now_at,last_error='attempts_exhausted',lease_id=null,lease_until=null where kind in ('merchant-daily','merchant-weekly') and status in ('pending','processing','failed') and provider_id is null and held_at is null and attempts>=10 and (lease_until is null or lease_until<=now_at);
 select * into q from pci_private.notification_queue where kind in ('merchant-daily','merchant-weekly') and status in ('pending','failed','processing') and provider_id is null and held_at is null and due_at<=now_at and next_attempt_at<=now_at and (status<>'processing' or lease_until<=now_at) order by due_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('ok',true,'job',null);end if;
 now_at=pci_private.clock_now();update pci_private.notification_queue set status='processing',attempts=attempts+1,lease_id=p_lease,lease_until=now_at+interval '120 seconds' where id=q.id;
 facts=pci_private.notification_facts(q.id);select * into d from pci_private.notification_deliveries where notification_id=q.id;
 return jsonb_build_object('ok',true,'job',jsonb_build_object('id',q.id,'lease',p_lease,'facts',facts,'sourceHash',pci_private.notification_source_hash(facts),'delivery',case when d.notification_id is null then null else jsonb_build_object('envelope',d.envelope,'hash',d.payload_hash,'scope',d.scope_hash,'sourceHash',d.source_hash,'recipientHash',d.recipient_hash) end));
end $$;
revoke all on function pci_private.init_merchant_report_cursor(),pci_private.capture_merchant_withdrawal(),pci_private.notification_facts(uuid),public.pci_queue_merchant_reports(),public.pci_claim_merchant_notification(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_queue_merchant_reports(),public.pci_claim_merchant_notification(uuid) to service_role;
commit;
