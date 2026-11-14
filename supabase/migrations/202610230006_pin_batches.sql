begin;
create table pci_private.pin_batches (
 id uuid primary key,
 capability_id uuid not null references pci_private.capabilities(id),
 restaurant_id uuid not null references public.pci_restaurants(id),
 voucher_ids uuid[] not null check(cardinality(voucher_ids) between 1 and 6),
 receipt_ids uuid[] not null check(cardinality(receipt_ids)=cardinality(voucher_ids)),
 redeemed_at timestamptz not null,
 undo_until timestamptz not null check(undo_until=redeemed_at+interval '2 minutes'),
 undone_at timestamptz
);
alter table pci_private.pin_batches enable row level security;
revoke all on pci_private.pin_batches from public,anon,authenticated,service_role;
create index on pci_private.pin_batches(capability_id,redeemed_at desc);
create function pci_private.pin_batch_result(p_batch pci_private.pin_batches,p_code text) returns jsonb
language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'code',p_code,'batchId',p_batch.id,'quantity',cardinality(p_batch.voucher_ids),'redeemedAt',p_batch.redeemed_at,'undoUntil',p_batch.undo_until,'serverNow',pci_private.clock_now(),'undoneAt',p_batch.undone_at)
$$;
create function public.pci_redeem_pin_batch(p_token_hash text,p_pin text,p_request_id uuid,p_vouchers uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c pci_private.capabilities;b pci_private.pin_batches;restaurant uuid;selected uuid[];verified jsonb;result jsonb;voucher uuid;receipts uuid[]='{}';first_at timestamptz;
begin
 if p_request_id is null or p_vouchers is null or cardinality(p_vouchers) not between 1 and 6 or array_position(p_vouchers,null) is not null then return jsonb_build_object('ok',false,'code','invalid_selection');end if;
 select array_agg(distinct x order by x) into selected from unnest(p_vouchers) x;
 if cardinality(selected)<>cardinality(p_vouchers) then return jsonb_build_object('ok',false,'code','invalid_selection');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into c from pci_private.capabilities where token_hash=p_token_hash and revoked_at is null for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select restaurant_id into restaurant from public.pci_orders where id=c.order_id and status in ('paid','free-issued','partially-refunded','refunded');
 if not found or (select count(*) from public.pci_vouchers where id=any(selected) and order_id=c.order_id and (c.voucher_id is null or id=c.voucher_id))<>cardinality(selected) then return jsonb_build_object('ok',false,'code','not_found');end if;
 verified=pci_private.verify_pin(restaurant,p_pin);if not (verified->>'ok')::boolean then return verified;end if;
 select * into b from pci_private.pin_batches where id=p_request_id;
 if found then
  if b.capability_id<>c.id or b.voucher_ids<>selected then return jsonb_build_object('ok',false,'code','request_conflict');end if;
  return pci_private.pin_batch_result(b,case when b.undone_at is null then 'already_redeemed' else 'already_undone' end);
 end if;
 perform id from public.pci_vouchers where id=any(selected) order by id for update;
 if exists(select 1 from public.pci_vouchers v where v.id=any(selected) and (v.status not in ('unused','extended') or v.expires_on<pci_private.rome_today() or exists(select 1 from public.pci_refunds f where f.voucher_id=v.id and f.status='processing'))) then return jsonb_build_object('ok',false,'code','state_changed');end if;
 -- Any failure, including crossing midnight between members, rolls the entire selection back.
 begin
  foreach voucher in array selected loop
   result=pci_private.redeem_core(voucher,'pin','restaurant-pin');
   if not (result->>'ok')::boolean then raise exception using errcode='P0001',message='pin_batch_state_changed';end if;
   receipts=array_append(receipts,(result->>'redemption_id')::uuid);
  end loop;
  select min(redeemed_at) into first_at from public.pci_redemptions where id=any(receipts);
  insert into pci_private.pin_batches(id,capability_id,restaurant_id,voucher_ids,receipt_ids,redeemed_at,undo_until) values(p_request_id,c.id,restaurant,selected,receipts,first_at,first_at+interval '2 minutes') returning * into b;
 exception when sqlstate 'P0001' then
  if sqlerrm<>'pin_batch_state_changed' then raise;end if;
  return jsonb_build_object('ok',false,'code','state_changed');
 end;
 return pci_private.pin_batch_result(b,'redeemed');
end $$;
create function public.pci_undo_pin_batch(p_token_hash text,p_pin text,p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c pci_private.capabilities;b pci_private.pin_batches;verified jsonb;result jsonb;receipt uuid;
begin
 if p_batch_id is null then return jsonb_build_object('ok',false,'code','invalid_selection');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_batch_id::text,0));
 select * into c from pci_private.capabilities where token_hash=p_token_hash and revoked_at is null for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into b from pci_private.pin_batches where id=p_batch_id and capability_id=c.id;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 verified=pci_private.verify_pin(b.restaurant_id,p_pin);if not (verified->>'ok')::boolean then return verified;end if;
 if b.undone_at is not null then return pci_private.pin_batch_result(b,'already_undone');end if;
 if pci_private.clock_now()>b.undo_until then return jsonb_build_object('ok',false,'code','undo_window_closed');end if;
 perform id from public.pci_vouchers where id=any(b.voucher_ids) order by id for update;
 if (select count(*) from public.pci_redemptions r join public.pci_vouchers v on v.id=r.voucher_id where r.id=any(b.receipt_ids) and r.method='pin' and r.voided_at is null and v.status='redeemed' and v.current_redemption_id=r.id)<>cardinality(b.voucher_ids) then return jsonb_build_object('ok',false,'code','not_current');end if;
 begin
  foreach receipt in array b.receipt_ids loop
   result=pci_private.undo_core(receipt,true);
   if not (result->>'ok')::boolean then raise exception using errcode='P0001',message='pin_batch_undo_changed';end if;
  end loop;
  update pci_private.pin_batches set undone_at=pci_private.clock_now() where id=b.id returning * into b;
 exception when sqlstate 'P0001' then
  if sqlerrm<>'pin_batch_undo_changed' then raise;end if;
  return jsonb_build_object('ok',false,'code','undo_window_closed');
 end;
 return pci_private.pin_batch_result(b,'undone');
end $$;
-- Keep the original display allowlist private and add only the current capability's undo receipt.
alter function public.pci_read_voucher_capability(text) set schema pci_private;
revoke all on function pci_private.pci_read_voucher_capability(text) from public,anon,authenticated,service_role;
create function public.pci_read_voucher_capability(p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c pci_private.capabilities;result jsonb;b pci_private.pin_batches;last_batch jsonb=null;
begin
 select * into c from pci_private.capabilities where token_hash=p_token_hash and revoked_at is null for share;
 if not found then return null;end if;
 result=pci_private.pci_read_voucher_capability(p_token_hash);if result is null then return null;end if;
 select * into b from pci_private.pin_batches where capability_id=c.id and undone_at is null and undo_until>=pci_private.clock_now()
 and not exists(select 1 from public.pci_redemptions r where r.id=any(pin_batches.receipt_ids) and r.voided_at is not null)
 order by redeemed_at desc,id desc limit 1;
 if found then last_batch=pci_private.pin_batch_result(b,'already_redeemed');end if;
 return result||jsonb_build_object('lastPinBatch',last_batch);
end $$;
revoke all on function pci_private.pin_batch_result(pci_private.pin_batches,text) from public,anon,authenticated,service_role;
revoke all on function public.pci_redeem_pin_batch(text,text,uuid,uuid[]),public.pci_undo_pin_batch(text,text,uuid),public.pci_read_voucher_capability(text) from public,anon,authenticated,service_role;
grant execute on function public.pci_redeem_pin_batch(text,text,uuid,uuid[]),public.pci_undo_pin_batch(text,text,uuid),public.pci_read_voucher_capability(text) to service_role;
commit;
