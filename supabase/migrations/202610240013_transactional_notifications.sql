begin;
-- Existing voucher/refund flows may hold source locks before cancelling queue rows.
-- Take the full quiet-window boundary before locking the queue; never wait with a partial set.
lock table public.pci_orders,public.pci_vouchers,public.pci_redemptions,public.pci_refunds,pci_private.notification_queue in access exclusive mode nowait;
alter table pci_private.notification_queue add column lease_id uuid,add column lease_until timestamptz,add column next_attempt_at timestamptz not null default pci_private.clock_now(),add column held_at timestamptz,add column last_error text,add column first_dispatch_at timestamptz,add column provider_id uuid;
create unique index pci_notification_provider_unique on pci_private.notification_queue(provider_id) where provider_id is not null;
create index on pci_private.notification_queue(due_at,next_attempt_at,id) where status in ('pending','processing','failed') and held_at is null;
-- Unknown legacy processing/failure cannot be assumed safe to resend.
update pci_private.notification_queue set held_at=pci_private.clock_now(),last_error='legacy_unknown',status='failed' where status in ('processing','failed');
create table pci_private.notification_deliveries (
 notification_id uuid primary key references pci_private.notification_queue(id),envelope text not null check(length(envelope) between 48 and 2097152 and envelope ~ '^m1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),scope_hash text not null check(scope_hash ~ '^[a-f0-9]{64}$'),source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),recipient_hash text not null check(recipient_hash ~ '^[a-f0-9]{64}$'),prepared_at timestamptz not null default pci_private.clock_now()
);
create table pci_private.notification_attempts (
 notification_id uuid references pci_private.notification_deliveries(notification_id),lease_id uuid,started_at timestamptz not null default pci_private.clock_now(),primary key(notification_id,lease_id)
);
alter table pci_private.notification_deliveries enable row level security;alter table pci_private.notification_attempts enable row level security;
revoke all on pci_private.notification_deliveries,pci_private.notification_attempts from public,anon,authenticated,service_role;
create function pci_private.reject_notification_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Notification snapshots and attempt proofs are immutable' using errcode='23514';end$$;
create trigger pci_notification_delivery_immutable before update or delete on pci_private.notification_deliveries for each row execute function pci_private.reject_notification_mutation();
create trigger pci_notification_attempt_immutable before update or delete on pci_private.notification_attempts for each row execute function pci_private.reject_notification_mutation();

create function pci_private.queue_purchase_mail() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.purchased_at is not null and new.status in ('paid','free-issued') then
  if tg_op='INSERT' or old.purchased_at is null or old.status not in ('paid','free-issued','partially-refunded','refunded') then
   insert into pci_private.notification_queue(order_id,kind,dedup_key,language) values(new.id,'purchase-confirmation','purchase-confirmation:'||new.id::text,new.language) on conflict(dedup_key) do nothing;
  end if;
 end if;return new;
end $$;
create trigger pci_notification_purchase after insert or update on public.pci_orders for each row execute function pci_private.queue_purchase_mail();
create function pci_private.queue_completed_refund_mail() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='succeeded' and (tg_op='INSERT' or old.status is distinct from new.status) then
  insert into pci_private.notification_queue(voucher_id,order_id,kind,dedup_key,language,payload)
  select new.voucher_id,new.order_id,case when new.type='withdrawal' then 'withdrawal-receipt' else 'refund-notification' end,'completed-refund:'||new.id::text,o.language,jsonb_build_object('refund_id',new.id) from public.pci_orders o where o.id=new.order_id on conflict(dedup_key) do nothing;
 end if;return new;
end $$;
create trigger pci_notification_refund after insert or update on public.pci_refunds for each row execute function pci_private.queue_completed_refund_mail();
-- Only known missing completed receipts are backfilled; no guessed historical purchase resends.
insert into pci_private.notification_queue(voucher_id,order_id,kind,dedup_key,language,payload)
select f.voucher_id,f.order_id,case when f.type='withdrawal' then 'withdrawal-receipt' else 'refund-notification' end,'completed-refund:'||f.id::text,o.language,jsonb_build_object('refund_id',f.id)
from public.pci_refunds f join public.pci_orders o on o.id=f.order_id where f.status='succeeded' and f.receipt_sent_at is null on conflict(dedup_key) do nothing;

create function pci_private.notification_facts(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;o public.pci_orders;v public.pci_vouchers;f public.pci_refunds;m public.pci_menu_versions;op pci_private.management_operations;recipient text;restaurant text;cap jsonb;vouchers jsonb;occurred timestamptz;amount bigint;today date=pci_private.rome_today();
begin
 select * into q from pci_private.notification_queue where id=p_id;select * into o from public.pci_orders where id=q.order_id;
 if o.id is null or o.purchased_at is null or o.status not in ('paid','free-issued','partially-refunded','refunded') then return null;end if;
 select email into recipient from pci_private.order_contacts where order_id=o.id;if recipient is null then return null;end if;
 select * into m from public.pci_menu_versions where id=o.menu_version_id;select name into restaurant from public.pci_restaurants where id=o.restaurant_id;
 if q.voucher_id is not null then select * into v from public.pci_vouchers where id=q.voucher_id and order_id=o.id;if not found then return null;end if;end if;
 occurred=o.purchased_at;amount=o.total_amount_cents;
 if q.kind in ('expiry-30','expiry-7') then
  if v.id is null or v.status not in ('unused','extended') or v.expires_on<today or q.payload->>'expires_on' is distinct from v.expires_on::text or exists(select 1 from public.pci_refunds where voucher_id=v.id and status in ('pending','processing','failed')) then return null;end if;
  if q.kind='expiry-30' and v.expires_on-today not between 8 and 30 or q.kind='expiry-7' and v.expires_on-today not between 0 and 7 then return null;end if;
  occurred=q.created_at;amount=o.unit_amount_cents;
 elsif q.kind in ('withdrawal-requested','extension-confirmation') then
  select * into op from pci_private.management_operations where notification_key=q.dedup_key and voucher_id=v.id and purpose=case when q.kind='withdrawal-requested' then 'withdrawal' else 'extension' end;
  if not found then return null;end if;occurred=op.completed_at;amount=o.unit_amount_cents;
  if q.kind='withdrawal-requested' then select * into f from public.pci_refunds where id=op.refund_id and order_id=o.id and voucher_id=v.id and type='withdrawal';if not found then return null;end if;amount=f.amount_cents;end if;
 elsif q.kind in ('withdrawal-receipt','refund-notification') then
  select * into f from public.pci_refunds where id::text=q.payload->>'refund_id' and order_id=o.id and voucher_id=v.id and status='succeeded' and type=case when q.kind='withdrawal-receipt' then 'withdrawal' else 'merchant-default' end;
  if not found then return null;end if;occurred=f.completed_at;amount=f.amount_cents;
 elsif q.kind<>'purchase-confirmation' then return null;
 end if;
 select jsonb_agg(jsonb_build_object('id',x.id,'status',x.status,'expiresOn',x.expires_on,'shortCode',case when x.status in ('unused','extended') and x.expires_on>=today and not exists(select 1 from public.pci_refunds where voucher_id=x.id and status='processing') then x.short_code end,'usable',x.status in ('unused','extended') and x.expires_on>=today and not exists(select 1 from public.pci_refunds where voucher_id=x.id and status='processing')) order by x.id) into vouchers from public.pci_vouchers x where x.order_id=o.id;
 if vouchers is null or jsonb_array_length(vouchers)<>o.quantity then return null;end if;
 select jsonb_build_object('tokenHash',c.token_hash,'encryptedToken',c.encrypted_token) into cap from pci_private.capabilities c where c.order_id=o.id and c.voucher_id is null and c.revoked_at is null order by c.created_at,c.id limit 1;
 if q.kind='purchase-confirmation' and cap is null and exists(select 1 from jsonb_array_elements(vouchers) x where (x->>'usable')::boolean) then return null;end if;
 return jsonb_build_object('kind',q.kind,'orderId',o.id,'voucherId',q.voucher_id,'language',o.language,'recipient',recipient,'restaurant',restaurant,'salesMode',o.sales_mode,'quantity',o.quantity,'people',m.people,'unitPriceCents',case when o.sales_mode='prepaid' then o.unit_amount_cents else m.price_cents end,'onlineTotalCents',o.total_amount_cents,'amountCents',amount,'occurredAt',occurred,'sourceAsOf',pci_private.clock_now(),'expiresOn',v.expires_on,'refund',case when f.id is null then null else jsonb_build_object('id',f.id,'status',f.status,'availableAfter',f.available_after,'completedAt',f.completed_at) end,'menu',m.translations,'vouchers',vouchers,'capability',cap);
end $$;
create function pci_private.notification_source_hash(p_facts jsonb) returns text language sql immutable set search_path='' as $$
 select case when p_facts is null then null else encode(extensions.digest(concat_ws(chr(10),p_facts->>'recipient',p_facts->>'kind',p_facts->>'orderId',coalesce(p_facts->>'voucherId',''),p_facts->>'language',coalesce(p_facts->'capability'->>'tokenHash','')),'sha256'),'hex') end
$$;
create function public.pci_claim_notification(p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;d pci_private.notification_deliveries;facts jsonb;now_at timestamptz=pci_private.clock_now();
begin
 if p_lease is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 update pci_private.notification_queue set status='failed',held_at=now_at,last_error='window_expired',lease_id=null,lease_until=null where status in ('pending','processing','failed') and provider_id is null and held_at is null and first_dispatch_at is not null and first_dispatch_at<=now_at-interval '23 hours';
 update pci_private.notification_queue set status='failed',held_at=now_at,last_error='attempts_exhausted',lease_id=null,lease_until=null where status in ('pending','processing','failed') and provider_id is null and held_at is null and attempts>=10 and (lease_until is null or lease_until<=now_at);
 select * into q from pci_private.notification_queue where kind in ('purchase-confirmation','withdrawal-requested','withdrawal-receipt','refund-notification','extension-confirmation','expiry-30','expiry-7') and status in ('pending','failed','processing') and provider_id is null and held_at is null and due_at<=now_at and next_attempt_at<=now_at and (status<>'processing' or lease_until<=now_at) order by due_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('ok',true,'job',null);end if;
 update pci_private.notification_queue set status='processing',attempts=attempts+1,lease_id=p_lease,lease_until=now_at+interval '120 seconds' where id=q.id;
 facts=pci_private.notification_facts(q.id);select * into d from pci_private.notification_deliveries where notification_id=q.id;
 return jsonb_build_object('ok',true,'job',jsonb_build_object('id',q.id,'lease',p_lease,'facts',facts,'sourceHash',pci_private.notification_source_hash(facts),'delivery',case when d.notification_id is null then null else jsonb_build_object('envelope',d.envelope,'hash',d.payload_hash,'scope',d.scope_hash,'sourceHash',d.source_hash,'recipientHash',d.recipient_hash) end));
end $$;
create function public.pci_prepare_notification(p_id uuid,p_lease uuid,p_envelope text,p_hash text,p_scope text,p_source_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;d pci_private.notification_deliveries;facts jsonb;
begin
 select * into q from pci_private.notification_queue where id=p_id for update;
 if not found or q.status<>'processing' or q.lease_id is distinct from p_lease or q.lease_until<=pci_private.clock_now() then return jsonb_build_object('ok',false,'code','lease_lost');end if;
 if p_envelope is null or length(p_envelope) not between 48 and 2097152 or p_envelope !~ '^m1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_scope is null or p_scope !~ '^[a-f0-9]{64}$' or p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 select * into d from pci_private.notification_deliveries where notification_id=p_id;
 if found then
  if d.payload_hash<>p_hash or d.scope_hash<>p_scope or d.source_hash<>p_source_hash then return jsonb_build_object('ok',false,'code','payload_conflict');end if;
 else
  facts=pci_private.notification_facts(p_id);if pci_private.notification_source_hash(facts) is distinct from p_source_hash then return jsonb_build_object('ok',false,'code','source_changed');end if;
  insert into pci_private.notification_deliveries(notification_id,envelope,payload_hash,scope_hash,source_hash,recipient_hash) values(p_id,p_envelope,p_hash,p_scope,p_source_hash,encode(extensions.digest(facts->>'recipient','sha256'),'hex')) returning * into d;
 end if;
 return jsonb_build_object('ok',true,'envelope',d.envelope,'hash',d.payload_hash,'scope',d.scope_hash,'sourceHash',d.source_hash,'recipientHash',d.recipient_hash);
end $$;
create function public.pci_begin_notification(p_id uuid,p_lease uuid,p_hash text,p_scope text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;d pci_private.notification_deliveries;facts jsonb;error text;now_at timestamptz;
begin
 select * into q from pci_private.notification_queue where id=p_id for update;
 now_at=pci_private.clock_now();
 if q.provider_id is not null then return jsonb_build_object('ok',true,'code','already_accepted');end if;
 if q.status='cancelled' then return jsonb_build_object('ok',false,'code','cancelled');end if;
 if q.id is null or q.status<>'processing' or q.lease_id is distinct from p_lease or q.lease_until<=now_at then return jsonb_build_object('ok',false,'code','lease_lost');end if;
 facts=pci_private.notification_facts(p_id);
  if facts is null and q.kind in ('expiry-30','expiry-7') then update pci_private.notification_queue set status='cancelled',lease_id=null,lease_until=null where id=p_id;return jsonb_build_object('ok',false,'code','cancelled');end if;
 select * into d from pci_private.notification_deliveries where notification_id=p_id;
 if d.notification_id is null or d.payload_hash is distinct from p_hash then return jsonb_build_object('ok',false,'code','payload_conflict');end if;
 if d.scope_hash is distinct from p_scope then error='scope_changed';
 elsif q.first_dispatch_at is not null and q.first_dispatch_at<=now_at-interval '23 hours' then error='window_expired';
 else
  if facts is null then error='source_unavailable';
  elsif encode(extensions.digest(facts->>'recipient','sha256'),'hex')<>d.recipient_hash then error='recipient_changed';
  elsif pci_private.notification_source_hash(facts)<>d.source_hash then error='source_changed';end if;
 end if;
 if error is not null then update pci_private.notification_queue set status='failed',held_at=now_at,last_error=error,lease_id=null,lease_until=null where id=p_id;return jsonb_build_object('ok',false,'code',error);end if;
 -- Source reads may take time too: authorize only against a fresh clock.
 now_at=pci_private.clock_now();
 if q.lease_until<=now_at then return jsonb_build_object('ok',false,'code','lease_lost');end if;
 if q.first_dispatch_at is not null and q.first_dispatch_at<=now_at-interval '23 hours' then
  update pci_private.notification_queue set status='failed',held_at=now_at,last_error='window_expired',lease_id=null,lease_until=null where id=p_id;
  return jsonb_build_object('ok',false,'code','window_expired');
 end if;
 insert into pci_private.notification_attempts(notification_id,lease_id) values(p_id,p_lease) on conflict do nothing;
 update pci_private.notification_queue set first_dispatch_at=coalesce(first_dispatch_at,now_at) where id=p_id;
 return jsonb_build_object('ok',true,'code','dispatch','serverNow',now_at,'dispatchUntil',least(q.lease_until,coalesce(q.first_dispatch_at,now_at)+interval '23 hours'));
end $$;
create function public.pci_finish_notification(p_id uuid,p_lease uuid,p_hash text,p_scope text,p_outcome text,p_provider_id uuid default null,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q pci_private.notification_queue;d pci_private.notification_deliveries;now_at timestamptz=pci_private.clock_now();error text;
begin
 select * into q from pci_private.notification_queue where id=p_id for update;
 if q.id is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 if q.provider_id is not null then
  if p_outcome='accepted' and p_provider_id is distinct from q.provider_id then return jsonb_build_object('ok',false,'code','provider_conflict');end if;
  return jsonb_build_object('ok',true,'code','already_accepted');
 end if;
 select * into d from pci_private.notification_deliveries where notification_id=p_id;
 if p_outcome='accepted' then
  if d.notification_id is null or d.payload_hash is distinct from p_hash or d.scope_hash is distinct from p_scope or p_provider_id is null or not exists(select 1 from pci_private.notification_attempts where notification_id=p_id and lease_id=p_lease) then return jsonb_build_object('ok',false,'code','not_started');end if;
  if exists(select 1 from pci_private.notification_queue where provider_id=p_provider_id and id<>p_id) then return jsonb_build_object('ok',false,'code','provider_conflict');end if;
  update pci_private.notification_queue set status='sent',provider_id=p_provider_id,sent_at=coalesce(sent_at,now_at),held_at=null,last_error=null,lease_id=null,lease_until=null where id=p_id;
  if q.kind in ('withdrawal-receipt','refund-notification') then update public.pci_refunds set receipt_sent_at=coalesce(receipt_sent_at,now_at) where id::text=q.payload->>'refund_id' and voucher_id=q.voucher_id and order_id=q.order_id and status='succeeded';end if;
  return jsonb_build_object('ok',true,'code','accepted');
 end if;
 if q.status='cancelled' then return jsonb_build_object('ok',false,'code','cancelled');end if;
 if q.status<>'processing' or q.lease_id is distinct from p_lease or q.lease_until<=now_at then return jsonb_build_object('ok',false,'code','lease_lost');end if;
 if p_outcome is null or p_outcome not in ('retry','hold') or p_provider_id is not null or p_error is null or p_error not in ('unconfirmed','provider_rejected','payload_conflict','scope_changed','source_changed','recipient_changed','source_unavailable','key_unavailable','window_expired','attempts_exhausted') then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 error=case when q.first_dispatch_at is not null and q.first_dispatch_at<=now_at-interval '23 hours' then 'window_expired' when q.attempts>=10 then 'attempts_exhausted' else p_error end;
 update pci_private.notification_queue set status='failed',last_error=error,held_at=case when p_outcome='hold' or error in ('window_expired','attempts_exhausted') then now_at end,next_attempt_at=now_at+make_interval(secs=>least(3600,60*(2^least(greatest(q.attempts-1,0),6))::integer)),lease_id=null,lease_until=null where id=p_id;
 return jsonb_build_object('ok',true,'code',case when p_outcome='hold' or error in ('window_expired','attempts_exhausted') then 'held' else 'retry' end);
end $$;
revoke all on function pci_private.reject_notification_mutation(),pci_private.queue_purchase_mail(),pci_private.queue_completed_refund_mail(),pci_private.notification_facts(uuid),pci_private.notification_source_hash(jsonb),public.pci_claim_notification(uuid),public.pci_prepare_notification(uuid,uuid,text,text,text,text),public.pci_begin_notification(uuid,uuid,text,text),public.pci_finish_notification(uuid,uuid,text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_claim_notification(uuid),public.pci_prepare_notification(uuid,uuid,text,text,text,text),public.pci_begin_notification(uuid,uuid,text,text),public.pci_finish_notification(uuid,uuid,text,text,text,uuid,text) to service_role;
commit;
