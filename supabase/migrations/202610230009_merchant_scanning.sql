begin;
create table pci_private.merchant_batches (
 id uuid primary key,capability_id uuid not null references pci_private.capabilities(id),
 restaurant_id uuid not null references public.pci_restaurants(id),user_id uuid not null references auth.users(id),session_id uuid not null,
 voucher_ids uuid[] not null check(cardinality(voucher_ids) between 1 and 6),receipt_ids uuid[] not null check(cardinality(receipt_ids)=cardinality(voucher_ids)),
 redeemed_at timestamptz not null,undo_until timestamptz not null check(undo_until=redeemed_at+interval '2 minutes'),undone_at timestamptz
);
alter table pci_private.merchant_batches enable row level security;
revoke all on pci_private.merchant_batches from public,anon,authenticated,service_role;
create index on pci_private.merchant_batches(capability_id,user_id,session_id,redeemed_at desc);
create function pci_private.merchant_session() returns uuid language sql stable set search_path='' as $$
 select case when auth.jwt()->>'session_id' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then (auth.jwt()->>'session_id')::uuid else null end
$$;
create function pci_private.merchant_allowed(p_restaurant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and pci_private.merchant_session() is not null and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) and (pci_private.is_admin() or pci_private.is_merchant(p_restaurant))
$$;
create function pci_private.lock_merchant(p_restaurant uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not pci_private.merchant_allowed(p_restaurant) then return false;end if;
 perform id from auth.users where id=auth.uid() and email_confirmed_at is not null for share;if not found then return false;end if;
 if pci_private.is_admin() then perform user_id from pci_private.platform_members where user_id=auth.uid() and role='admin' for share;
 else perform user_id from public.pci_restaurant_members where restaurant_id=p_restaurant and user_id=auth.uid() and active for share;end if;
 return found;
end $$;
create function pci_private.merchant_batch_result(p_batch pci_private.merchant_batches,p_code text) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'code',p_code,'batchId',p_batch.id,'quantity',cardinality(p_batch.voucher_ids),'redeemedAt',p_batch.redeemed_at,'undoUntil',p_batch.undo_until,'serverNow',pci_private.clock_now(),'undoneAt',p_batch.undone_at)
$$;
create function public.pci_read_merchant_voucher(p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.capabilities;restaurant uuid;view jsonb;b pci_private.merchant_batches;last_batch jsonb=null;
begin
 if auth.uid() is null or pci_private.merchant_session() is null then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 select * into c from pci_private.capabilities where token_hash=p_token_hash and revoked_at is null;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select restaurant_id into restaurant from public.pci_orders where id=c.order_id;
 if not pci_private.merchant_allowed(restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 view=pci_private.pci_read_voucher_capability(p_token_hash);if view is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into b from pci_private.merchant_batches where capability_id=c.id and user_id=auth.uid() and session_id=pci_private.merchant_session() order by redeemed_at desc,id desc limit 1;
 if found then last_batch=pci_private.merchant_batch_result(b,case when b.undone_at is null then 'already_redeemed' else 'already_undone' end);end if;
 return jsonb_build_object('ok',true,'view',view,'lastBatch',last_batch);
end $$;
create function public.pci_redeem_merchant_batch(p_token_hash text,p_request_id uuid,p_vouchers uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.capabilities;b pci_private.merchant_batches;restaurant uuid;selected uuid[];result jsonb;voucher uuid;receipts uuid[]='{}';first_at timestamptz;
begin
 if auth.uid() is null or pci_private.merchant_session() is null then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 if p_request_id is null or p_vouchers is null or cardinality(p_vouchers) not between 1 and 6 or array_position(p_vouchers,null) is not null then return jsonb_build_object('ok',false,'code','invalid_selection');end if;
 select array_agg(distinct x order by x) into selected from unnest(p_vouchers) x;if cardinality(selected)<>cardinality(p_vouchers) then return jsonb_build_object('ok',false,'code','invalid_selection');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into c from pci_private.capabilities where token_hash=p_token_hash and revoked_at is null for share;if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select restaurant_id into restaurant from public.pci_orders where id=c.order_id and status in ('paid','free-issued','partially-refunded','refunded');
 if not found or not pci_private.lock_merchant(restaurant) or (select count(*) from public.pci_vouchers where id=any(selected) and order_id=c.order_id and (c.voucher_id is null or c.voucher_id=id))<>cardinality(selected) then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into b from pci_private.merchant_batches where id=p_request_id;
 if found then
  if b.capability_id<>c.id or b.user_id<>auth.uid() or b.session_id<>pci_private.merchant_session() or b.voucher_ids<>selected then return jsonb_build_object('ok',false,'code','request_conflict');end if;
  return pci_private.merchant_batch_result(b,case when b.undone_at is null then 'already_redeemed' else 'already_undone' end);
 end if;
 perform id from public.pci_vouchers where id=any(selected) order by id for update;
 if exists(select 1 from public.pci_vouchers v where v.id=any(selected) and (v.status not in ('unused','extended') or v.expires_on<pci_private.rome_today() or exists(select 1 from public.pci_refunds f where f.voucher_id=v.id and f.status='processing'))) then return jsonb_build_object('ok',false,'code','state_changed');end if;
 begin
  foreach voucher in array selected loop
   result=pci_private.redeem_core(voucher,'scan','merchant');if not (result->>'ok')::boolean then raise exception using errcode='P0001',message='merchant_batch_state_changed';end if;
   receipts=array_append(receipts,(result->>'redemption_id')::uuid);
  end loop;
  select min(redeemed_at) into first_at from public.pci_redemptions where id=any(receipts);
  insert into pci_private.merchant_batches(id,capability_id,restaurant_id,user_id,session_id,voucher_ids,receipt_ids,redeemed_at,undo_until) values(p_request_id,c.id,restaurant,auth.uid(),pci_private.merchant_session(),selected,receipts,first_at,first_at+interval '2 minutes') returning * into b;
 exception when sqlstate 'P0001' then
  if sqlerrm<>'merchant_batch_state_changed' then raise;end if;
  return jsonb_build_object('ok',false,'code','state_changed');
 end;
 return pci_private.merchant_batch_result(b,'redeemed');
end $$;
create function public.pci_undo_merchant_batch(p_token_hash text,p_batch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.capabilities;b pci_private.merchant_batches;result jsonb;receipt uuid;
begin
 if auth.uid() is null or pci_private.merchant_session() is null then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 if p_batch_id is null then return jsonb_build_object('ok',false,'code','invalid_selection');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_batch_id::text,0));
 select * into c from pci_private.capabilities where token_hash=p_token_hash and revoked_at is null for share;if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into b from pci_private.merchant_batches where id=p_batch_id and capability_id=c.id and user_id=auth.uid() and session_id=pci_private.merchant_session();
 if not found or not pci_private.lock_merchant(b.restaurant_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if b.undone_at is not null then return pci_private.merchant_batch_result(b,'already_undone');end if;
 perform id from public.pci_vouchers where id=any(b.voucher_ids) order by id for update;
 if pci_private.clock_now()>b.undo_until then return jsonb_build_object('ok',false,'code','undo_window_closed');end if;
 if (select count(*) from public.pci_redemptions r join public.pci_vouchers v on v.id=r.voucher_id where r.id=any(b.receipt_ids) and r.actor_id=auth.uid() and r.method='scan' and r.voided_at is null and v.status='redeemed' and v.current_redemption_id=r.id)<>cardinality(b.voucher_ids) then return jsonb_build_object('ok',false,'code','not_current');end if;
 begin
  foreach receipt in array b.receipt_ids loop
   result=pci_private.undo_core(receipt,false);if not (result->>'ok')::boolean then raise exception using errcode='P0001',message='merchant_batch_undo_changed';end if;
  end loop;
  update pci_private.merchant_batches set undone_at=pci_private.clock_now() where id=b.id returning * into b;
 exception when sqlstate 'P0001' then
  if sqlerrm<>'merchant_batch_undo_changed' then raise;end if;
  return jsonb_build_object('ok',false,'code','undo_window_closed');
 end;
 return pci_private.merchant_batch_result(b,'undone');
end $$;
create or replace function public.pci_undo_redemption(p_redemption uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from pci_private.merchant_batches where p_redemption=any(receipt_ids)) then return jsonb_build_object('ok',false,'code','batch_required');end if;
 return pci_private.undo_core(p_redemption,false);
end $$;
create function public.pci_merchant_today(p_restaurant uuid default null,p_cursor jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
 with page as (select r.id,r.redeemed_at,r.voided_at,r.method,v.short_code,m.translations->'it'->>'name' menu_name,m.people from public.pci_redemptions r join public.pci_vouchers v on v.id=r.voucher_id join public.pci_menu_versions m on m.id=v.menu_version_id where r.restaurant_id=restaurant and r.redeemed_at>=today::timestamp at time zone 'Europe/Rome' and r.redeemed_at<(today+1)::timestamp at time zone 'Europe/Rome' and (p_cursor is null or (r.redeemed_at,r.id)<(cursor_at,cursor_id)) order by r.redeemed_at desc,r.id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'redeemedAt',redeemed_at,'voidedAt',voided_at,'method',method,'shortCode',short_code,'menu',menu_name,'people',people) order by redeemed_at desc,id desc),'[]') into records from page;
 if jsonb_array_length(records)>50 then records=records-50;next_cursor=jsonb_build_object('at',records->49->'redeemedAt','id',records->49->'id');end if;
 return jsonb_build_object('ok',true,'serverNow',pci_private.clock_now(),'date',today,'restaurants',restaurants,'restaurantId',restaurant,'records',records,'nextCursor',next_cursor);
end $$;
revoke all on function pci_private.merchant_session(),pci_private.merchant_allowed(uuid),pci_private.lock_merchant(uuid),pci_private.merchant_batch_result(pci_private.merchant_batches,text),public.pci_read_merchant_voucher(text),public.pci_redeem_merchant_batch(text,uuid,uuid[]),public.pci_undo_merchant_batch(text,uuid),public.pci_merchant_today(uuid,jsonb) from public,anon,authenticated,service_role;
-- Legacy single mutations are owner-only cores; external staff must use device-bound batches.
revoke all on function public.pci_redeem_voucher(uuid,public.pci_redemption_method),public.pci_undo_redemption(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_read_merchant_voucher(text),public.pci_redeem_merchant_batch(text,uuid,uuid[]),public.pci_undo_merchant_batch(text,uuid),public.pci_merchant_today(uuid,jsonb) to authenticated;
commit;
