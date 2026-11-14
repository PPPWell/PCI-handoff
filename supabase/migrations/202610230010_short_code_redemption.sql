begin;
alter table pci_private.merchant_batches alter column capability_id drop not null;
alter table pci_private.merchant_batches add column source_method public.pci_redemption_method not null default 'scan',add column served_at timestamptz;
alter table pci_private.merchant_batches add constraint merchant_source_scope check(source_method in ('scan','short_code','offline') and ((source_method='scan')=(capability_id is not null)) and ((source_method='offline')=(served_at is not null)));
alter table public.pci_redemptions add column served_at timestamptz;
alter table public.pci_redemptions drop constraint pci_redemptions_previous_status_check;
alter table public.pci_redemptions add constraint pci_redemptions_previous_status_check check(previous_status in ('unused','extended') or previous_status='expired' and method='offline');
alter table public.pci_redemptions add constraint redemption_service_time check((method='offline')=(served_at is not null) and (served_at is null or pg_catalog.isfinite(served_at) and served_at<=redeemed_at and redeemed_at-served_at<=interval '24 hours'));
create table pci_private.short_code_limits(user_id uuid primary key references auth.users(id) on delete cascade,window_at timestamptz not null default pci_private.clock_now(),attempts integer not null default 0 check(attempts between 0 and 30));
alter table pci_private.short_code_limits enable row level security;
revoke all on pci_private.short_code_limits from public,anon,authenticated,service_role;
create function pci_private.short_code_quota() returns jsonb language plpgsql security definer set search_path='' as $$
declare bucket pci_private.short_code_limits;now_at timestamptz;
begin
 insert into pci_private.short_code_limits(user_id) values(auth.uid()) on conflict do nothing;
 select * into bucket from pci_private.short_code_limits where user_id=auth.uid() for update;now_at=pci_private.clock_now();
 if now_at>=bucket.window_at+interval '60 seconds' then update pci_private.short_code_limits set attempts=1,window_at=now_at where user_id=auth.uid();
 elsif bucket.attempts>=30 then return jsonb_build_object('ok',false,'code','rate_limited','retryAt',bucket.window_at+interval '60 seconds');
 else update pci_private.short_code_limits set attempts=attempts+1 where user_id=auth.uid();end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function pci_private.merchant_batch_result(p_batch pci_private.merchant_batches,p_code text) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'code',p_code,'batchId',p_batch.id,'quantity',cardinality(p_batch.voucher_ids),'redeemedAt',p_batch.redeemed_at,'undoUntil',p_batch.undo_until,'serverNow',pci_private.clock_now(),'undoneAt',p_batch.undone_at,'method',p_batch.source_method,'servedAt',p_batch.served_at)
$$;
create or replace function pci_private.check_voucher_transition() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.pci_orders; r public.pci_redemptions;
begin
 if tg_op='INSERT' then
  if new.status<>'unused' or new.extended_once then raise exception 'New vouchers must be unused' using errcode='23514';end if;
  select * into o from public.pci_orders where id=new.order_id for update;
  if o.status not in ('paid','free-issued','partially-refunded') or new.purchased_at<>o.purchased_at then raise exception 'Voucher needs a settled order snapshot' using errcode='23514';end if;
  if (select count(*) from public.pci_vouchers where order_id=new.order_id)>=o.quantity then raise exception 'Order quantity exceeded' using errcode='23514';end if;
  return new;
 end if;
 if new is not distinct from old then return new;end if;
 if row(new.id,new.order_id,new.restaurant_id,new.menu_version_id,new.short_code,new.purchased_at) is distinct from row(old.id,old.order_id,old.restaurant_id,old.menu_version_id,old.short_code,old.purchased_at) then raise exception 'Voucher identity is immutable' using errcode='23514';end if;
 if new.status=old.status then raise exception 'Voucher metadata can only change with a legal transition' using errcode='23514';end if;
 if new.status<>'extended' and (new.expires_on<>old.expires_on or new.extended_once<>old.extended_once or new.extended_at is distinct from old.extended_at) then raise exception 'Extension facts are immutable' using errcode='23514';end if;
 if old.status='redeemed' and new.status in ('unused','extended','expired') then
  select * into r from public.pci_redemptions where id=old.current_redemption_id;
  if r.voided_at is null or r.previous_status<>new.status or pci_private.clock_now()>r.redeemed_at+interval '2 minutes' or current_setting('pci.method',true)<>'undo' then raise exception 'Redemption undo is not authorized' using errcode='23514';end if;
  return new;
 end if;
 -- A late entry is distinct from a new use after expiry. The actual offline
 -- receipt proves the reported meal was during validity and recorded within24h.
 if new.status='redeemed' and new.redeemed_method='offline' then
  if old.status not in ('unused','extended','expired') or not exists(
   select 1 from public.pci_redemptions x where x.id=new.current_redemption_id and x.voucher_id=old.id and x.voided_at is null and x.method='offline' and x.previous_status=old.status and x.redeemed_at=new.redeemed_at
   and pg_catalog.isfinite(x.served_at) and x.served_at>=old.purchased_at and x.served_at<=x.redeemed_at and x.redeemed_at-x.served_at<=interval '24 hours' and (x.served_at at time zone 'Europe/Rome')::date<=old.expires_on
  ) or exists(select 1 from public.pci_refunds where voucher_id=old.id and status='processing') then raise exception 'Invalid offline receipt' using errcode='23514';end if;
  return new;
 end if;
 if old.status not in ('unused','extended') then raise exception 'Terminal voucher state cannot transition' using errcode='23514';end if;
 if new.status='extended' then
  select * into o from public.pci_orders where id=old.order_id;
  if old.status<>'unused' or old.extended_once or not new.extended_once or pci_private.clock_now()<o.withdrawal_deadline or old.expires_on<pci_private.rome_today() or new.expires_on<>(old.expires_on+interval '6 months')::date then raise exception 'Invalid extension' using errcode='23514';end if;
 elsif new.status='redeemed' then
  if old.expires_on<pci_private.rome_today() then raise exception 'Voucher expired' using errcode='23514';end if;
  if not exists(select 1 from public.pci_redemptions where id=new.current_redemption_id and voucher_id=old.id and voided_at is null and method=new.redeemed_method and redeemed_at=new.redeemed_at and previous_status=old.status) then raise exception 'Active redemption receipt required' using errcode='23514';end if;
  if exists(select 1 from public.pci_refunds where voucher_id=old.id and status='processing') then raise exception 'Refund is processing' using errcode='23514';end if;
 elsif new.status='expired' then
  if old.expires_on>=pci_private.rome_today() then raise exception 'Expiry date has not ended in Italy' using errcode='23514';end if;
 elsif new.status in ('withdrawn','refunded') then
  if not exists(select 1 from public.pci_refunds where voucher_id=old.id and status='succeeded' and ((new.status='withdrawn' and type='withdrawal') or (new.status='refunded' and type='merchant-default'))) then raise exception 'Confirmed refund required' using errcode='23514';end if;
 else raise exception 'Invalid voucher transition' using errcode='23514';
 end if;
 return new;
end $$;
create function pci_private.short_code_view(p_voucher uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('voucherId',v.id,'restaurantId',r.id,'restaurant',r.name,'shortCode',v.short_code,'serverNow',pci_private.clock_now(),'status',v.status,'expiresOn',v.expires_on,'purchasedAt',v.purchased_at,'redeemedAt',v.redeemed_at,
 'menu',jsonb_build_object('name',m.translations->'it'->>'name','people',m.people,'version',m.version,'summary',m.translations->'it'->>'summary'),
 'normalAvailable',v.status in ('unused','extended') and v.expires_on>=(pci_private.clock_now() at time zone 'Europe/Rome')::date and not exists(select 1 from public.pci_refunds where voucher_id=v.id and status='processing'),
 'offlineAvailable',v.status in ('unused','extended','expired') and v.expires_on>=((pci_private.clock_now()-interval '24 hours') at time zone 'Europe/Rome')::date and not exists(select 1 from public.pci_refunds where voucher_id=v.id and status='processing'))
 from public.pci_orders o join public.pci_restaurants r on r.id=o.restaurant_id join public.pci_menu_versions m on m.id=o.menu_version_id join public.pci_vouchers v on v.order_id=o.id where v.id=p_voucher and o.status in ('paid','free-issued','partially-refunded','refunded');
$$;
-- Read the current operation and voucher in one statement, including after undo.
create function pci_private.short_code_result(p_batch_id uuid,p_replayed boolean) returns jsonb language sql volatile security definer set search_path='' as $$
 select pci_private.merchant_batch_result(b,case when b.undone_at is null then case when p_replayed then 'already_redeemed' else 'redeemed' end else case when p_replayed then 'already_undone' else 'undone' end end) || jsonb_build_object('view',pci_private.short_code_view(b.voucher_ids[1]))
 from pci_private.merchant_batches b where b.id=p_batch_id and b.capability_id is null
$$;
create function public.pci_read_short_code_request(p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b pci_private.merchant_batches;
begin
 select * into b from pci_private.merchant_batches where id=p_request_id and capability_id is null and user_id=auth.uid() and session_id=pci_private.merchant_session();
 if not found or not pci_private.merchant_allowed(b.restaurant_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 return pci_private.short_code_result(b.id,true);
end $$;
create function public.pci_lookup_short_code(p_restaurant uuid,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;result jsonb;quota jsonb;b pci_private.merchant_batches;last_batch jsonb=null;
begin
 if not pci_private.merchant_allowed(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_code is null or p_code !~ '^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 quota=pci_private.short_code_quota();if not (quota->>'ok')::boolean then return quota;end if;
 select * into v from public.pci_vouchers where restaurant_id=p_restaurant and short_code=p_code;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 result=pci_private.short_code_view(v.id);
 if result is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into b from pci_private.merchant_batches where user_id=auth.uid() and session_id=pci_private.merchant_session() and capability_id is null and voucher_ids=array[v.id] order by redeemed_at desc,id desc limit 1;
 if found then last_batch=pci_private.short_code_result(b.id,true);end if;
 return jsonb_build_object('ok',true,'view',result,'lastBatch',last_batch);
end $$;
create function pci_private.redeem_offline_core(p_voucher uuid,p_served_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;r public.pci_redemptions;now_at timestamptz;
begin
 select * into v from public.pci_vouchers where id=p_voucher for update;if not found then return jsonb_build_object('ok',false,'code','not_found');end if;now_at=pci_private.clock_now();
 if p_served_at is null or not pg_catalog.isfinite(p_served_at) or p_served_at>now_at or p_served_at<now_at-interval '24 hours' or p_served_at<v.purchased_at or (p_served_at at time zone 'Europe/Rome')::date>v.expires_on then return jsonb_build_object('ok',false,'code','invalid_time');end if;
 if v.status not in ('unused','extended','expired') or exists(select 1 from public.pci_refunds where voucher_id=v.id and status='processing') then return jsonb_build_object('ok',false,'code','state_changed');end if;
 perform pci_private.set_transition_context('merchant','offline','Late entry: meal time stored separately');
 update public.pci_refunds set status='cancelled',reason_code='redeemed_before_refund' where voucher_id=v.id and status='pending';
 insert into public.pci_redemptions(voucher_id,restaurant_id,actor_id,method,previous_status,served_at) values(v.id,v.restaurant_id,auth.uid(),'offline',v.status,p_served_at) returning * into r;
 update public.pci_vouchers set status='redeemed',redeemed_at=r.redeemed_at,redeemed_method='offline',current_redemption_id=r.id where id=v.id;
 return jsonb_build_object('ok',true,'redemption_id',r.id);
end $$;
create function public.pci_redeem_short_code(p_restaurant uuid,p_code text,p_voucher uuid,p_request_id uuid,p_served_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;b pci_private.merchant_batches;r public.pci_redemptions;quota jsonb;result jsonb;method public.pci_redemption_method;
begin
 if not pci_private.merchant_allowed(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_request_id is null or p_code is null or p_code !~ '^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' or p_voucher is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 method=case when p_served_at is null then 'short_code'::public.pci_redemption_method else 'offline'::public.pci_redemption_method end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into b from pci_private.merchant_batches where id=p_request_id;
 if found then
  if b.capability_id is not null or b.user_id<>auth.uid() or b.session_id<>pci_private.merchant_session() or b.restaurant_id<>p_restaurant or b.voucher_ids<>array[p_voucher] or b.source_method<>method or b.served_at is distinct from p_served_at or not exists(select 1 from public.pci_vouchers where id=p_voucher and short_code=p_code) then return jsonb_build_object('ok',false,'code','request_conflict');end if;
  if not pci_private.lock_merchant(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
  return pci_private.short_code_result(b.id,true);
 end if;
 quota=pci_private.short_code_quota();if not (quota->>'ok')::boolean then return quota;end if;
 if not pci_private.lock_merchant(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 select v0.* into v from public.pci_vouchers v0 join public.pci_orders o on o.id=v0.order_id where v0.id=p_voucher and v0.restaurant_id=p_restaurant and v0.short_code=p_code and o.status in ('paid','free-issued','partially-refunded','refunded') for update of v0;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 if method='offline' then result=pci_private.redeem_offline_core(v.id,p_served_at);
 else
  if v.status not in ('unused','extended') or v.expires_on<pci_private.rome_today() or exists(select 1 from public.pci_refunds where voucher_id=v.id and status='processing') then return jsonb_build_object('ok',false,'code','state_changed');end if;
  result=pci_private.redeem_core(v.id,'short_code','merchant');
 end if;
 if not (result->>'ok')::boolean then return result;end if;
 select * into r from public.pci_redemptions where id=(result->>'redemption_id')::uuid;
 insert into pci_private.merchant_batches(id,capability_id,restaurant_id,user_id,session_id,voucher_ids,receipt_ids,redeemed_at,undo_until,source_method,served_at) values(p_request_id,null,p_restaurant,auth.uid(),pci_private.merchant_session(),array[v.id],array[r.id],r.redeemed_at,r.redeemed_at+interval '2 minutes',method,p_served_at) returning * into b;
 return pci_private.short_code_result(b.id,false);
end $$;
create function public.pci_undo_short_code(p_batch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b pci_private.merchant_batches;result jsonb;
begin
 if p_batch_id is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_batch_id::text,0));
 select * into b from pci_private.merchant_batches where id=p_batch_id and capability_id is null and user_id=auth.uid() and session_id=pci_private.merchant_session();
 if not found or not pci_private.lock_merchant(b.restaurant_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if b.undone_at is not null then return pci_private.short_code_result(b.id,true);end if;
 perform id from public.pci_vouchers where id=any(b.voucher_ids) for update;
 if pci_private.clock_now()>b.undo_until then return jsonb_build_object('ok',false,'code','undo_window_closed');end if;
 result=pci_private.undo_core(b.receipt_ids[1],false);if not (result->>'ok')::boolean then return result;end if;
 update pci_private.merchant_batches set undone_at=pci_private.clock_now() where id=b.id returning * into b;
 return pci_private.short_code_result(b.id,false);
end $$;
create or replace function public.pci_merchant_today(p_restaurant uuid default null,p_cursor jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare restaurants jsonb;restaurant uuid;records jsonb;next_cursor jsonb=null;cursor_at timestamptz;cursor_id uuid;today date=pci_private.rome_today();
begin
 if auth.uid() is null or pci_private.merchant_session() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name,r.id) into restaurants from public.pci_restaurants r where pci_private.merchant_allowed(r.id);
 if restaurants is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 restaurant=coalesce(p_restaurant,(restaurants->0->>'id')::uuid);if not pci_private.merchant_allowed(restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_cursor is not null then
  begin
   if jsonb_typeof(p_cursor)<>'object' or (select count(*) from jsonb_object_keys(p_cursor))<>2 then raise exception 'bad cursor';end if;
   cursor_at=(p_cursor->>'at')::timestamptz;cursor_id=(p_cursor->>'id')::uuid;if cursor_at is null or cursor_id is null then raise exception 'bad cursor';end if;
  exception when others then return jsonb_build_object('ok',false,'code','invalid_request');end;
 end if;
 with page as (select r.id,r.redeemed_at,r.served_at,r.voided_at,r.method,v.short_code,m.translations->'it'->>'name' menu_name,m.people from public.pci_redemptions r join public.pci_vouchers v on v.id=r.voucher_id join public.pci_menu_versions m on m.id=v.menu_version_id where r.restaurant_id=restaurant and r.redeemed_at>=today::timestamp at time zone 'Europe/Rome' and r.redeemed_at<(today+1)::timestamp at time zone 'Europe/Rome' and (p_cursor is null or (r.redeemed_at,r.id)<(cursor_at,cursor_id)) order by r.redeemed_at desc,r.id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'redeemedAt',redeemed_at,'servedAt',served_at,'voidedAt',voided_at,'method',method,'shortCode',short_code,'menu',menu_name,'people',people) order by redeemed_at desc,id desc),'[]') into records from page;
 if jsonb_array_length(records)>50 then records=records-50;next_cursor=jsonb_build_object('at',records->49->'redeemedAt','id',records->49->'id');end if;
 return jsonb_build_object('ok',true,'serverNow',pci_private.clock_now(),'date',today,'restaurants',restaurants,'restaurantId',restaurant,'records',records,'nextCursor',next_cursor);
end $$;
revoke all on function pci_private.short_code_view(uuid),pci_private.short_code_result(uuid,boolean),pci_private.short_code_quota(),pci_private.redeem_offline_core(uuid,timestamptz),public.pci_lookup_short_code(uuid,text),public.pci_redeem_short_code(uuid,text,uuid,uuid,timestamptz),public.pci_read_short_code_request(uuid),public.pci_undo_short_code(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_lookup_short_code(uuid,text),public.pci_redeem_short_code(uuid,text,uuid,uuid,timestamptz),public.pci_read_short_code_request(uuid),public.pci_undo_short_code(uuid) to authenticated;
commit;
