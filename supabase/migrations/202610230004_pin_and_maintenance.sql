begin;
-- Queue state changes are retained instead of deleting reminder history.
alter table pci_private.notification_queue drop constraint notification_queue_status_check;
alter table pci_private.notification_queue add constraint notification_queue_status_check check(status in ('pending','processing','sent','failed','cancelled'));
create function public.pci_set_restaurant_pin(p_restaurant uuid,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(pci_private.is_admin() or pci_private.is_merchant(p_restaurant,true)) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_pin is null or p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','invalid_pin');end if;
 update pci_private.restaurant_settings set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',12)),failed_pin_attempts=0,pin_locked_until=null where restaurant_id=p_restaurant;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 return jsonb_build_object('ok',true);
end $$;
create function pci_private.verify_pin(p_restaurant uuid,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare settings pci_private.restaurant_settings;attempts integer;
begin
 select * into settings from pci_private.restaurant_settings where restaurant_id=p_restaurant for update;
 if not found or settings.pin_hash is null then return jsonb_build_object('ok',false,'code','pin_not_configured');end if;
 if settings.pin_locked_until>pci_private.clock_now() then return jsonb_build_object('ok',false,'code','pin_locked','retry_at',settings.pin_locked_until);end if;
 attempts=case when settings.pin_locked_until is not null then 0 else settings.failed_pin_attempts end;
 if p_pin is null or p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','invalid_pin');end if;
 if extensions.crypt(p_pin,settings.pin_hash)<>settings.pin_hash then
  attempts=attempts+1;
  update pci_private.restaurant_settings set failed_pin_attempts=attempts,pin_locked_until=case when attempts>=5 then pci_private.clock_now()+interval '15 minutes' else null end where restaurant_id=p_restaurant;
  -- Return, rather than raise: the failed-attempt increment must commit.
  return jsonb_build_object('ok',false,'code','incorrect_pin','attempts_remaining',5-attempts);
 end if;
 update pci_private.restaurant_settings set failed_pin_attempts=0,pin_locked_until=null where restaurant_id=p_restaurant;
 return jsonb_build_object('ok',true);
end $$;
create function pci_private.capability_allows(p_token_hash text,p_voucher uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pci_private.capabilities c join public.pci_vouchers v on v.order_id=c.order_id where v.id=p_voucher and c.token_hash=p_token_hash and c.revoked_at is null and (c.voucher_id is null or c.voucher_id=v.id))
$$;
create function public.pci_redeem_with_pin(p_voucher uuid,p_token_hash text,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare restaurant uuid;verified jsonb;
begin
 if not pci_private.capability_allows(p_token_hash,p_voucher) then return jsonb_build_object('ok',false,'code','not_found');end if;
 select restaurant_id into restaurant from public.pci_vouchers where id=p_voucher;
 verified=pci_private.verify_pin(restaurant,p_pin);if not (verified->>'ok')::boolean then return verified;end if;
 return pci_private.redeem_core(p_voucher,'pin','restaurant-pin');
end $$;
create function public.pci_undo_with_pin(p_redemption uuid,p_token_hash text,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare voucher uuid;restaurant uuid;verified jsonb;
begin
 select voucher_id,restaurant_id into voucher,restaurant from public.pci_redemptions where id=p_redemption;
 if not found or not pci_private.capability_allows(p_token_hash,voucher) then return jsonb_build_object('ok',false,'code','not_found');end if;
 verified=pci_private.verify_pin(restaurant,p_pin);if not (verified->>'ok')::boolean then return verified;end if;
 return pci_private.undo_core(p_redemption,true);
end $$;
create function pci_private.cancel_voucher_reminders() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then update pci_private.notification_queue set status='cancelled' where voucher_id=new.id and kind in ('expiry-30','expiry-7') and status in ('pending','processing','failed');end if;
 return new;
end $$;
create trigger pci_cancel_reminders after update on public.pci_vouchers for each row execute function pci_private.cancel_voucher_reminders();
create function pci_private.cancel_refund_reminders() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update pci_private.notification_queue set status='cancelled' where voucher_id=new.voucher_id and kind in ('expiry-30','expiry-7') and status in ('pending','processing','failed');return new;
end $$;
create trigger pci_refund_cancel_reminders after insert on public.pci_refunds for each row execute function pci_private.cancel_refund_reminders();
create function public.pci_run_voucher_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;today date=pci_private.rome_today();kind text;n_expired integer=0;n_queued integer=0;n integer;
begin
 for v in select * from public.pci_vouchers where status in ('unused','extended') order by id for update skip locked loop
  -- Preserve a captured refund entitlement until its provider operation resolves.
  if exists(select 1 from public.pci_refunds where voucher_id=v.id and status in ('pending','processing','failed')) then continue;end if;
  if v.expires_on<today then
   perform pci_private.set_transition_context('system','expiry');update public.pci_vouchers set status='expired' where id=v.id;n_expired=n_expired+1;continue;
  end if;
  kind=case when v.expires_on-today between 0 and 7 then 'expiry-7' when v.expires_on-today between 8 and 30 then 'expiry-30' else null end;
  if kind='expiry-7' then update pci_private.notification_queue set status='cancelled' where voucher_id=v.id and notification_queue.kind='expiry-30' and status in ('pending','processing','failed');end if;
  if kind is not null then
   insert into pci_private.notification_queue(voucher_id,order_id,kind,dedup_key,language,payload)
   select v.id,v.order_id,kind,kind||':'||v.id::text||':'||v.expires_on::text,o.language,jsonb_build_object('voucher_id',v.id,'expires_on',v.expires_on) from public.pci_orders o where o.id=v.order_id
   on conflict(dedup_key) do update set status='pending'
   where notification_queue.status='cancelled';
   get diagnostics n=row_count;n_queued=n_queued+n;
  end if;
 end loop;
 return jsonb_build_object('expired',n_expired,'queued',n_queued);
end $$;
revoke all on function pci_private.verify_pin(uuid,text),pci_private.capability_allows(text,uuid),pci_private.cancel_voucher_reminders(),pci_private.cancel_refund_reminders() from public,anon,authenticated,service_role;
revoke all on function public.pci_set_restaurant_pin(uuid,text),public.pci_redeem_with_pin(uuid,text,text),public.pci_undo_with_pin(uuid,text,text),public.pci_run_voucher_maintenance() from public,anon,authenticated,service_role;
grant execute on function public.pci_set_restaurant_pin(uuid,text) to authenticated;
grant execute on function public.pci_redeem_with_pin(uuid,text,text),public.pci_undo_with_pin(uuid,text,text),public.pci_run_voucher_maintenance() to service_role;
commit;
