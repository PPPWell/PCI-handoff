begin;
create function pci_private.rome_today() returns date language sql volatile set search_path='' as $$ select (pci_private.clock_now() at time zone 'Europe/Rome')::date $$;
create function pci_private.set_transition_context(p_actor_kind text,p_method text,p_note text default null) returns void language plpgsql set search_path='' as $$
begin
 perform set_config('pci.actor_kind',p_actor_kind,true);perform set_config('pci.method',p_method,true);perform set_config('pci.note',coalesce(p_note,''),true);
end $$;

create function pci_private.check_voucher_transition() returns trigger language plpgsql security definer set search_path='' as $$
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
 if old.status='redeemed' and new.status in ('unused','extended') then
  select * into r from public.pci_redemptions where id=old.current_redemption_id;
  if r.voided_at is null or r.previous_status<>new.status or pci_private.clock_now()>r.redeemed_at+interval '2 minutes' or current_setting('pci.method',true)<>'undo' then raise exception 'Redemption undo is not authorized' using errcode='23514';end if;
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
create trigger pci_check_transition before insert or update on public.pci_vouchers for each row execute function pci_private.check_voucher_transition();
create function pci_private.record_voucher_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.pci_voucher_events(voucher_id,from_status,to_status,actor_id,actor_kind,method,note)
  values(new.id,case when tg_op='INSERT' then null else old.status end,new.status,auth.uid(),coalesce(nullif(current_setting('pci.actor_kind',true),''),'system'),coalesce(nullif(current_setting('pci.method',true),''),case when tg_op='INSERT' then 'issue' else 'manual' end),nullif(current_setting('pci.note',true),''));
 end if;return new;
end $$;
create trigger pci_record_transition after insert or update on public.pci_vouchers for each row execute function pci_private.record_voucher_event();

create function pci_private.redeem_core(p_voucher uuid,p_method public.pci_redemption_method,p_actor_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;r public.pci_redemptions;
begin
 select * into v from public.pci_vouchers where id=p_voucher for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 if v.status='redeemed' then return jsonb_build_object('ok',false,'code','already_redeemed','redeemed_at',v.redeemed_at);end if;
 if v.status not in ('unused','extended') then return jsonb_build_object('ok',false,'code',v.status);end if;
 if v.expires_on<pci_private.rome_today() then return jsonb_build_object('ok',false,'code','expired');end if;
 if exists(select 1 from public.pci_refunds where voucher_id=v.id and status='processing') then return jsonb_build_object('ok',false,'code','refund_processing');end if;
 perform pci_private.set_transition_context(p_actor_kind,p_method::text);
 update public.pci_refunds set status='cancelled',reason_code='redeemed_before_refund' where voucher_id=v.id and status='pending';
 insert into public.pci_redemptions(voucher_id,restaurant_id,actor_id,method,previous_status) values(v.id,v.restaurant_id,auth.uid(),p_method,v.status) returning * into r;
 update public.pci_vouchers set status='redeemed',redeemed_at=r.redeemed_at,redeemed_method=p_method,current_redemption_id=r.id where id=v.id;
 return jsonb_build_object('ok',true,'status','redeemed','redemption_id',r.id,'redeemed_at',r.redeemed_at);
end $$;
create function public.pci_redeem_voucher(p_voucher uuid,p_method public.pci_redemption_method default 'scan') returns jsonb language plpgsql security definer set search_path='' as $$
declare restaurant uuid;
begin
 select restaurant_id into restaurant from public.pci_vouchers where id=p_voucher;
 if auth.uid() is null or not (pci_private.is_admin() or pci_private.is_merchant(restaurant)) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_method not in ('scan','short_code') then return jsonb_build_object('ok',false,'code','unsupported_method');end if;
 return pci_private.redeem_core(p_voucher,p_method,'merchant');
end $$;

create function pci_private.consume_management_grant(p_grant uuid,p_voucher uuid,p_purpose text) returns boolean language plpgsql security definer set search_path='' as $$
declare g pci_private.management_grants;
begin
 select * into g from pci_private.management_grants where id=p_grant for update;
 if not found or g.purchaser_id is distinct from auth.uid() or g.voucher_id<>p_voucher or g.purpose<>p_purpose or g.used_at is not null or g.expires_at<=pci_private.clock_now() then return false;end if;
 update pci_private.management_grants set used_at=pci_private.clock_now() where id=g.id;return true;
end $$;
create function public.pci_extend_voucher(p_voucher uuid,p_grant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;o public.pci_orders;
begin
 select * into v from public.pci_vouchers where id=p_voucher for update;
 if not found or auth.uid() is null or not (pci_private.is_admin() or pci_private.is_purchaser(v.order_id)) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if v.extended_once then return jsonb_build_object('ok',false,'code','already_extended');end if;
 if v.status<>'unused' then return jsonb_build_object('ok',false,'code',v.status);end if;
 if v.expires_on<pci_private.rome_today() then return jsonb_build_object('ok',false,'code','expired');end if;
 select * into o from public.pci_orders where id=v.order_id;
 if pci_private.clock_now()<o.withdrawal_deadline then return jsonb_build_object('ok',false,'code','too_early');end if;
 if exists(select 1 from public.pci_refunds where voucher_id=v.id and status in ('pending','processing')) then return jsonb_build_object('ok',false,'code','refund_pending');end if;
 if not pci_private.is_admin() and not pci_private.consume_management_grant(p_grant,v.id,'extension') then return jsonb_build_object('ok',false,'code','verification_required');end if;
 perform pci_private.set_transition_context(case when pci_private.is_admin() then 'admin' else 'purchaser' end,'extension');
 update public.pci_vouchers set status='extended',extended_once=true,extended_at=pci_private.clock_now(),expires_on=(expires_on+interval '6 months')::date where id=v.id;
 return jsonb_build_object('ok',true,'status','extended');
end $$;

create function pci_private.undo_core(p_redemption uuid,p_pin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pci_redemptions;v public.pci_vouchers;
begin
 -- All voucher-changing operations lock voucher first, then auxiliary rows.
 select v0.* into v from public.pci_vouchers v0 join public.pci_redemptions r0 on r0.voucher_id=v0.id where r0.id=p_redemption for update of v0;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into r from public.pci_redemptions where id=p_redemption for update;
 if r.voided_at is not null then return jsonb_build_object('ok',false,'code','already_voided');end if;
 if (p_pin and r.method<>'pin') or (not p_pin and (r.method='pin' or r.actor_id is distinct from auth.uid() or not(pci_private.is_merchant(v.restaurant_id) or pci_private.is_admin()))) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if pci_private.clock_now()>r.redeemed_at+interval '2 minutes' then return jsonb_build_object('ok',false,'code','undo_window_closed');end if;
 if v.status<>'redeemed' or v.current_redemption_id<>r.id then return jsonb_build_object('ok',false,'code','not_current');end if;
 perform pci_private.set_transition_context(case when p_pin then 'restaurant-pin' else 'merchant' end,'undo');
 update public.pci_redemptions set voided_at=pci_private.clock_now(),voided_by=auth.uid(),voided_method=r.method where id=r.id;
 update public.pci_vouchers set status=r.previous_status,redeemed_at=null,redeemed_method=null,current_redemption_id=null where id=v.id;
 return jsonb_build_object('ok',true,'status',r.previous_status);
end $$;
create function public.pci_undo_redemption(p_redemption uuid) returns jsonb language sql security definer set search_path='' as $$ select pci_private.undo_core(p_redemption,false) $$;

revoke all on function pci_private.rome_today(),pci_private.set_transition_context(text,text,text),pci_private.check_voucher_transition(),pci_private.record_voucher_event(),pci_private.redeem_core(uuid,public.pci_redemption_method,text),pci_private.consume_management_grant(uuid,uuid,text),pci_private.undo_core(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.pci_redeem_voucher(uuid,public.pci_redemption_method),public.pci_extend_voucher(uuid,uuid),public.pci_undo_redemption(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_redeem_voucher(uuid,public.pci_redemption_method),public.pci_extend_voucher(uuid,uuid),public.pci_undo_redemption(uuid) to authenticated;
commit;
