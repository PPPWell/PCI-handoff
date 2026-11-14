begin;
create function public.pci_claim_orders() returns jsonb language plpgsql security definer set search_path='' as $$
declare verified_email text;n integer;
begin
 select lower(btrim(email)) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then return jsonb_build_object('ok',false,'code','email_verification_required');end if;
 update public.pci_orders o set purchaser_id=auth.uid() from pci_private.order_contacts c where c.order_id=o.id and c.email=verified_email and o.purchaser_id is null;
 get diagnostics n=row_count;return jsonb_build_object('ok',true,'claimed',n);
end $$;
create function public.pci_create_management_grant(p_voucher uuid,p_purchaser uuid,p_purpose text) returns uuid language plpgsql security definer set search_path='' as $$
declare grant_id uuid;
begin
 if p_purpose not in ('withdrawal','extension') or not exists(select 1 from public.pci_vouchers v join public.pci_orders o on o.id=v.order_id join auth.users u on u.id=o.purchaser_id where v.id=p_voucher and o.purchaser_id=p_purchaser and u.email_confirmed_at is not null) then raise exception 'Invalid verified purchaser grant' using errcode='42501';end if;
 insert into pci_private.management_grants(voucher_id,purchaser_id,purpose) values(p_voucher,p_purchaser,p_purpose) returning id into grant_id;return grant_id;
end $$;
create function public.pci_request_withdrawal(p_voucher uuid,p_grant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;o public.pci_orders;existing uuid;r uuid;requested timestamptz=pci_private.clock_now();
begin
 select * into v from public.pci_vouchers where id=p_voucher for update;
 if not found or auth.uid() is null or not(pci_private.is_admin() or pci_private.is_purchaser(v.order_id)) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if v.status<>'unused' then return jsonb_build_object('ok',false,'code',v.status);end if;
 if v.expires_on<pci_private.rome_today() then return jsonb_build_object('ok',false,'code','expired');end if;
 select * into o from public.pci_orders where id=v.order_id;
 if requested>o.withdrawal_deadline then return jsonb_build_object('ok',false,'code','withdrawal_window_closed');end if;
 select id into existing from public.pci_refunds where voucher_id=v.id and status in ('pending','processing');
 if existing is not null then return jsonb_build_object('ok',true,'code','already_requested','refund_id',existing);end if;
 if not pci_private.is_admin() and not pci_private.consume_management_grant(p_grant,v.id,'withdrawal') then return jsonb_build_object('ok',false,'code','verification_required');end if;
 insert into public.pci_refunds(voucher_id,order_id,restaurant_id,type,requested_by,requested_at,available_after,amount_cents,commission_refund_cents,commission_vat_refund_cents)
 values(v.id,v.order_id,v.restaurant_id,'withdrawal',auth.uid(),requested,requested+interval '24 hours',o.unit_amount_cents,o.unit_commission_cents,o.unit_commission_vat_cents) returning id into r;
 return jsonb_build_object('ok',true,'refund_id',r,'available_after',requested+interval '24 hours');
end $$;
create function public.pci_request_merchant_refund(p_voucher uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;o public.pci_orders;r uuid;requested timestamptz=pci_private.clock_now();
begin
 if coalesce(auth.role(),'')<>'service_role' and not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_reason not in ('restaurant_unavailable','menu_unavailable') then return jsonb_build_object('ok',false,'code','invalid_reason');end if;
 select * into v from public.pci_vouchers where id=p_voucher for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 if v.status not in ('unused','extended') then return jsonb_build_object('ok',false,'code',v.status);end if;
 select id into r from public.pci_refunds where voucher_id=v.id and status in ('pending','processing');
 if r is not null then return jsonb_build_object('ok',true,'code','already_requested','refund_id',r);end if;
 select * into o from public.pci_orders where id=v.order_id;
 insert into public.pci_refunds(voucher_id,order_id,restaurant_id,type,requested_by,requested_at,available_after,amount_cents,commission_refund_cents,commission_vat_refund_cents,reason_code)
 values(v.id,v.order_id,v.restaurant_id,'merchant-default',auth.uid(),requested,requested,o.unit_amount_cents,o.unit_commission_cents,o.unit_commission_vat_cents,p_reason) returning id into r;
 return jsonb_build_object('ok',true,'refund_id',r);
end $$;
create function public.pci_prepare_refund(p_refund uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;r public.pci_refunds;
begin
 select v0.* into v from public.pci_vouchers v0 join public.pci_refunds r0 on r0.voucher_id=v0.id where r0.id=p_refund for update of v0;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into r from public.pci_refunds where id=p_refund for update;
 if r.status='succeeded' then return jsonb_build_object('ok',true,'code','already_completed');end if;
 if r.status='cancelled' then return jsonb_build_object('ok',false,'code','cancelled');end if;
 if v.status not in ('unused','extended') then
  update public.pci_refunds set status='cancelled',reason_code='voucher_unavailable' where id=r.id;
  return jsonb_build_object('ok',false,'code',v.status);
 end if;
 if r.available_after>pci_private.clock_now() then return jsonb_build_object('ok',false,'code','waiting_period');end if;
 update public.pci_refunds set status='processing',started_at=coalesce(started_at,pci_private.clock_now()) where id=r.id;
 return jsonb_build_object('ok',true,'refund_id',r.id,'order_id',r.order_id,'amount_cents',r.amount_cents,'commission_cents',r.commission_refund_cents,'commission_vat_cents',r.commission_vat_refund_cents);
end $$;
create function public.pci_fail_refund(p_refund uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;r public.pci_refunds;
begin
 select v0.* into v from public.pci_vouchers v0 join public.pci_refunds r0 on r0.voucher_id=v0.id where r0.id=p_refund for update of v0;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into r from public.pci_refunds where id=p_refund for update;
 if r.status<>'processing' then return jsonb_build_object('ok',false,'code','not_processing');end if;
 update public.pci_refunds set status='failed',reason_code='provider_failure' where id=r.id;
 return jsonb_build_object('ok',true);
end $$;
create function public.pci_complete_refund(p_refund uuid,p_provider_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;r public.pci_refunds;next_status public.pci_voucher_status;
begin
 select v0.* into v from public.pci_vouchers v0 join public.pci_refunds r0 on r0.voucher_id=v0.id where r0.id=p_refund for update of v0;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into r from public.pci_refunds where id=p_refund for update;
 if r.status='succeeded' then
  if r.stripe_refund_id is distinct from p_provider_id then return jsonb_build_object('ok',false,'code','provider_mismatch');end if;
  return jsonb_build_object('ok',true,'code','already_completed');
 end if;
 if r.status<>'processing' then return jsonb_build_object('ok',false,'code','not_processing');end if;
 if v.status not in ('unused','extended') then return jsonb_build_object('ok',false,'code',v.status);end if;
 if r.amount_cents>0 and (p_provider_id is null or p_provider_id !~ '^re_[A-Za-z0-9_]+$' or length(p_provider_id)>200) then return jsonb_build_object('ok',false,'code','provider_refund_required');end if;
 -- Serialize sibling completions before taking the aggregate statement snapshot.
 -- Lock order: voucher, its refund, then parent order; never lock sibling vouchers.
 perform 1 from public.pci_orders where id=v.order_id for update;
 next_status=case when r.type='withdrawal' then 'withdrawn'::public.pci_voucher_status else 'refunded'::public.pci_voucher_status end;
 update public.pci_refunds set status='succeeded',stripe_refund_id=p_provider_id,completed_at=pci_private.clock_now() where id=r.id;
 perform pci_private.set_transition_context('system',r.type);
 update public.pci_vouchers set status=next_status where id=v.id;
 update public.pci_orders o set status=case when (select count(*) from public.pci_vouchers where order_id=o.id and status in ('withdrawn','refunded'))=o.quantity then 'refunded' else 'partially-refunded' end where o.id=v.order_id;
 return jsonb_build_object('ok',true,'status',next_status);
end $$;

revoke all on function public.pci_claim_orders(),public.pci_create_management_grant(uuid,uuid,text),public.pci_request_withdrawal(uuid,uuid),public.pci_request_merchant_refund(uuid,text),public.pci_prepare_refund(uuid),public.pci_fail_refund(uuid),public.pci_complete_refund(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_claim_orders(),public.pci_request_withdrawal(uuid,uuid) to authenticated;
grant execute on function public.pci_request_merchant_refund(uuid,text) to authenticated,service_role;
grant execute on function public.pci_create_management_grant(uuid,uuid,text),public.pci_prepare_refund(uuid),public.pci_fail_refund(uuid),public.pci_complete_refund(uuid,text) to service_role;
commit;
