begin;
alter table pci_private.email_auth_challenges add column purpose text not null default 'login' check(purpose in ('login','withdrawal','extension'));
alter table pci_private.email_auth_challenges add column requester_id uuid references auth.users(id);
alter table pci_private.email_auth_challenges add column voucher_id uuid references public.pci_vouchers(id);
alter table pci_private.email_auth_challenges add column grant_id uuid unique references pci_private.management_grants(id);
alter table pci_private.email_auth_challenges add constraint pci_challenge_scope check((purpose='login' and requester_id is null and voucher_id is null and grant_id is null) or (purpose in ('withdrawal','extension') and requester_id is not null and voucher_id is not null));
alter table pci_private.management_grants add column verified_at timestamptz;
create table pci_private.management_operations (
 id uuid primary key references pci_private.management_grants(id),
 voucher_id uuid not null references public.pci_vouchers(id),purchaser_id uuid not null references auth.users(id),
 purpose text not null check(purpose in ('withdrawal','extension')),
 completed_at timestamptz not null default pci_private.clock_now(),
 refund_id uuid references public.pci_refunds(id),notification_key text not null,
 check((purpose='withdrawal')=(refund_id is not null))
);
alter table pci_private.management_operations enable row level security;
revoke all on pci_private.management_operations from public,anon,authenticated,service_role;
create index on pci_private.management_operations(voucher_id,completed_at desc);
create function pci_private.management_eligible(p_user uuid,p_voucher uuid,p_purpose text) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.pci_vouchers v join public.pci_orders o on o.id=v.order_id join auth.users u on u.id=o.purchaser_id
 where v.id=p_voucher and u.id=p_user and u.email_confirmed_at is not null and o.status in ('paid','free-issued','partially-refunded','refunded')
 and v.status='unused' and not v.extended_once and v.expires_on>=pci_private.rome_today()
 and not exists(select 1 from public.pci_refunds f where f.voucher_id=v.id and f.status in ('pending','processing'))
 and (p_purpose='withdrawal' and pci_private.clock_now()<=o.withdrawal_deadline or p_purpose='extension' and pci_private.clock_now()>o.withdrawal_deadline))
$$;
create function pci_private.management_context(p_user uuid,p_voucher uuid,p_purpose text,p_hash text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pci_private.email_auth_challenges c join public.pci_vouchers v on v.id=c.voucher_id join public.pci_orders o on o.id=v.order_id join auth.users u on u.id=c.requester_id
 where c.token_hash=p_hash and c.requester_id=p_user and c.voucher_id=p_voucher and c.purpose=p_purpose and p_purpose in ('withdrawal','extension') and o.purchaser_id=p_user and u.email_confirmed_at is not null and lower(btrim(u.email))=c.email and o.status in ('paid','free-issued','partially-refunded','refunded'))
$$;
alter function public.pci_auth_begin_verify(text) set schema pci_private;
alter function public.pci_auth_finish_verify(text,uuid,uuid) set schema pci_private;
revoke all on function pci_private.pci_auth_begin_verify(text),pci_private.pci_auth_finish_verify(text,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.pci_auth_start(p_email text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare lim pci_private.email_auth_limits;now_at timestamptz=pci_private.clock_now();
begin
 if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 insert into pci_private.email_auth_limits(email) values(p_email) on conflict do nothing;
 select * into lim from pci_private.email_auth_limits where email=p_email for update;
 -- Time must be sampled after potentially waiting for locks.
 now_at=pci_private.clock_now();
 if lim.locked_until>now_at then return jsonb_build_object('ok',false,'code','verification_locked','retryAt',lim.locked_until);end if;
 if lim.last_sent_at>now_at-interval '60 seconds' then return jsonb_build_object('ok',false,'code','send_cooldown','retryAt',lim.last_sent_at+interval '60 seconds');end if;
 if exists(select 1 from pci_private.email_auth_challenges where email=p_email and lease_until>now_at) then return jsonb_build_object('ok',false,'code','verification_busy');end if;
 update pci_private.email_auth_challenges set status='superseded',lease_id=null,lease_until=null where email=p_email and status in ('created','sent');
 update pci_private.email_auth_limits set last_sent_at=now_at,updated_at=now_at,verify_attempts=case when locked_until is not null then 0 else verify_attempts end,locked_until=null where email=p_email;
 insert into pci_private.email_auth_challenges(token_hash,email,created_at,expires_at) values(p_hash,p_email,now_at,now_at+interval '10 minutes');
 return jsonb_build_object('ok',true,'expiresAt',now_at+interval '10 minutes','retryAt',now_at+interval '60 seconds');
end $$;
create or replace function pci_private.pci_auth_begin_verify(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.email_auth_challenges;lim pci_private.email_auth_limits;now_at timestamptz=pci_private.clock_now();email_value text;lease uuid=gen_random_uuid();n integer;
begin
 select email into email_value from pci_private.email_auth_challenges where token_hash=p_hash;
 if not found then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 -- All send/verification writers take the email limit before a challenge row.
 select * into lim from pci_private.email_auth_limits where email=email_value for update;
 select * into c from pci_private.email_auth_challenges where token_hash=p_hash for update;
 -- Time must be sampled after potentially waiting for locks.
 now_at=pci_private.clock_now();
 if not found then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 if c.status='verified' then return jsonb_build_object('ok',false,'code','challenge_used');end if;
 if c.expires_at<=now_at then return jsonb_build_object('ok',false,'code','code_expired');end if;
 if c.status<>'sent' then return jsonb_build_object('ok',false,'code','not_sent');end if;
 if lim.locked_until>now_at then return jsonb_build_object('ok',false,'code','verification_locked','retryAt',lim.locked_until);end if;
 if c.lease_until>now_at then return jsonb_build_object('ok',false,'code','verification_busy');end if;
 n=case when lim.locked_until is not null then 1 else lim.verify_attempts+1 end;
 if n>5 then return jsonb_build_object('ok',false,'code','verification_locked','retryAt',now_at+interval '15 minutes');end if;
 update pci_private.email_auth_limits set verify_attempts=n,locked_until=case when n=5 then now_at+interval '15 minutes' else null end,updated_at=now_at where email=email_value;
 update pci_private.email_auth_challenges set lease_id=lease,lease_until=now_at+interval '30 seconds' where token_hash=p_hash;
 return jsonb_build_object('ok',true,'email',c.email,'leaseId',lease,'expiresAt',c.expires_at,'attemptsRemaining',5-n);
end $$;
create or replace function pci_private.pci_auth_finish_verify(p_hash text,p_lease uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.email_auth_challenges;lim pci_private.email_auth_limits;now_at timestamptz=pci_private.clock_now();email_value text;
begin
 select email into email_value from pci_private.email_auth_challenges where token_hash=p_hash;
 if not found then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 select * into lim from pci_private.email_auth_limits where email=email_value for update;
 select * into c from pci_private.email_auth_challenges where token_hash=p_hash for update;
 -- Time must be sampled after potentially waiting for locks.
 now_at=pci_private.clock_now();
 if not found or c.status<>'sent' or c.lease_id is distinct from p_lease or c.lease_until<=now_at or p_lease is null then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 if c.expires_at<=now_at then return jsonb_build_object('ok',false,'code','code_expired');end if;
 if p_user is null then
  update pci_private.email_auth_challenges set lease_id=null,lease_until=null where token_hash=p_hash;
  return jsonb_build_object('ok',false,'code','incorrect_code','attemptsRemaining',5-lim.verify_attempts,'retryAt',lim.locked_until);
 end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(btrim(email))=c.email) then return jsonb_build_object('ok',false,'code','identity_mismatch');end if;
 update pci_private.email_auth_challenges set status='verified',verified_user=p_user,verified_at=now_at,lease_id=null,lease_until=null where token_hash=p_hash;
 update pci_private.email_auth_limits set verify_attempts=0,locked_until=null,updated_at=now_at where email=c.email;
 return jsonb_build_object('ok',true);
end $$;
create function public.pci_auth_begin_verify(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from pci_private.email_auth_challenges where token_hash=p_hash and purpose='login') then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 return pci_private.pci_auth_begin_verify(p_hash);
end $$;
create function public.pci_auth_finish_verify(p_hash text,p_lease uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from pci_private.email_auth_challenges where token_hash=p_hash and purpose='login') then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 return pci_private.pci_auth_finish_verify(p_hash,p_lease,p_user);
end $$;
create function public.pci_management_start(p_user uuid,p_voucher uuid,p_purpose text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare email_value text;result jsonb;
begin
 select lower(btrim(u.email)) into email_value from public.pci_vouchers v join public.pci_orders o on o.id=v.order_id join auth.users u on u.id=o.purchaser_id where v.id=p_voucher and u.id=p_user and u.email_confirmed_at is not null and o.status in ('paid','free-issued','partially-refunded','refunded');
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 if not pci_private.management_eligible(p_user,p_voucher,p_purpose) then return jsonb_build_object('ok',false,'code','not_eligible');end if;
 result=public.pci_auth_start(email_value,p_hash);if not (result->>'ok')::boolean then return result;end if;
 update pci_private.email_auth_challenges set purpose=p_purpose,requester_id=p_user,voucher_id=p_voucher where token_hash=p_hash;
 return result;
end $$;
create function public.pci_management_begin_verify(p_user uuid,p_voucher uuid,p_purpose text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not pci_private.management_context(p_user,p_voucher,p_purpose,p_hash) then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 return pci_private.pci_auth_begin_verify(p_hash);
end $$;
create or replace function public.pci_create_management_grant(p_voucher uuid,p_purchaser uuid,p_purpose text) returns uuid language plpgsql security definer set search_path='' as $$
declare c pci_private.email_auth_challenges;grant_value uuid;
begin
 select * into c from pci_private.email_auth_challenges where requester_id=p_purchaser and voucher_id=p_voucher and purpose=p_purpose and status='verified' and verified_user=p_purchaser and verified_at>pci_private.clock_now()-interval '10 minutes' and grant_id is null order by verified_at desc for update limit 1;
 if not found or c.grant_id is not null or not pci_private.management_context(p_purchaser,p_voucher,p_purpose,c.token_hash) then raise exception 'Fresh scoped verification required' using errcode='42501';end if;
 insert into pci_private.management_grants(voucher_id,purchaser_id,purpose,verified_at,expires_at) values(p_voucher,p_purchaser,p_purpose,c.verified_at,c.verified_at+interval '10 minutes') returning id into grant_value;
 update pci_private.email_auth_challenges set grant_id=grant_value where token_hash=c.token_hash;
 return grant_value;
end $$;
create function public.pci_management_finish_verify(p_user uuid,p_voucher uuid,p_purpose text,p_hash text,p_lease uuid,p_verified_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;grant_value uuid;expires_value timestamptz;
begin
 if not pci_private.management_context(p_user,p_voucher,p_purpose,p_hash) then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 if p_verified_user is not null and p_verified_user<>p_user then return jsonb_build_object('ok',false,'code','identity_mismatch');end if;
 result=pci_private.pci_auth_finish_verify(p_hash,p_lease,p_verified_user);if not (result->>'ok')::boolean then return result;end if;
 grant_value=public.pci_create_management_grant(p_voucher,p_user,p_purpose);
 select expires_at into expires_value from pci_private.management_grants where id=grant_value;
 return jsonb_build_object('ok',true,'grantId',grant_value,'expiresAt',expires_value);
end $$;
create function pci_private.management_result(p_operation uuid,p_replayed boolean default false) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'operationId',m.id,'purpose',m.purpose,'voucherId',m.voucher_id,'code',case when m.purpose='extension' then 'extended' else 'withdrawal_requested' end,'completedAt',m.completed_at,'serverNow',pci_private.clock_now(),'replayed',p_replayed,'voucherStatus',v.status,'expiresOn',v.expires_on,
 'refund',case when f.id is null then null else jsonb_build_object('id',f.id,'status',f.status,'availableAfter',f.available_after,'amountCents',f.amount_cents) end,'notificationStatus',q.status)
 from pci_private.management_operations m join public.pci_vouchers v on v.id=m.voucher_id left join public.pci_refunds f on f.id=m.refund_id left join pci_private.notification_queue q on q.dedup_key=m.notification_key where m.id=p_operation
$$;
create function public.pci_confirm_management(p_voucher uuid,p_purpose text,p_grant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pci_vouchers;g pci_private.management_grants;o public.pci_orders;result jsonb;refund_value uuid;notification text;now_at timestamptz;
begin
 select * into v from public.pci_vouchers where id=p_voucher for update;
 if not found or auth.uid() is null or not pci_private.is_purchaser(v.order_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into g from pci_private.management_grants where id=p_grant for update;
 if not found or g.purchaser_id is distinct from auth.uid() or g.voucher_id<>v.id or g.purpose<>p_purpose or g.verified_at is null then return jsonb_build_object('ok',false,'code','verification_required');end if;
 if exists(select 1 from pci_private.management_operations where id=g.id) then return pci_private.management_result(g.id,true);end if;
 if g.used_at is not null or g.expires_at<=pci_private.clock_now() then return jsonb_build_object('ok',false,'code','verification_required');end if;
 if not pci_private.management_eligible(auth.uid(),v.id,p_purpose) then return jsonb_build_object('ok',false,'code','not_eligible');end if;
 if p_purpose='extension' then result=public.pci_extend_voucher(v.id,g.id);
 elsif p_purpose='withdrawal' then result=public.pci_request_withdrawal(v.id,g.id);
 else return jsonb_build_object('ok',false,'code','verification_required');end if;
 if not (result->>'ok')::boolean then return jsonb_build_object('ok',false,'code','not_eligible');end if;
 select * into o from public.pci_orders where id=v.order_id;
 now_at=pci_private.clock_now();
 if p_purpose='withdrawal' then
  refund_value=(result->>'refund_id')::uuid;
  select requested_at into now_at from public.pci_refunds where id=refund_value;
  notification='withdrawal-requested:'||refund_value::text;
 else notification='extension-confirmation:'||g.id::text;end if;
 update pci_private.management_grants set used_at=coalesce(used_at,now_at) where id=g.id;
 insert into pci_private.notification_queue(voucher_id,order_id,kind,dedup_key,language,payload) values(v.id,o.id,case when p_purpose='extension' then 'extension-confirmation' else 'withdrawal-requested' end,notification,o.language,jsonb_build_object('operation_id',g.id,'voucher_id',v.id,'refund_id',refund_value)) on conflict(dedup_key) do nothing;
 insert into pci_private.management_operations(id,voucher_id,purchaser_id,purpose,completed_at,refund_id,notification_key) values(g.id,v.id,auth.uid(),p_purpose,now_at,refund_value,notification);
 return pci_private.management_result(g.id,false);
end $$;
create function public.pci_read_purchaser_voucher(p_user uuid,p_voucher uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;operation uuid;
begin
 select jsonb_build_object('ok',true,'serverNow',pci_private.clock_now(),'voucherId',v.id,'orderId',o.id,'language',o.language,'salesMode',o.sales_mode,'unitAmountCents',o.unit_amount_cents,'purchasedAt',o.purchased_at,'withdrawalDeadline',o.withdrawal_deadline,'status',v.status,'expiresOn',v.expires_on,'extensionExpiresOn',(v.expires_on+interval '6 months')::date,'extendedOnce',v.extended_once,'redeemedAt',v.redeemed_at,
 'restaurant',r.name,'menu',jsonb_build_object('version',m.version,'people',m.people,'translations',m.translations),
 'withdrawalAvailable',pci_private.management_eligible(p_user,v.id,'withdrawal'),'extensionAvailable',pci_private.management_eligible(p_user,v.id,'extension'),
 'refund',(select jsonb_build_object('id',f.id,'status',f.status,'availableAfter',f.available_after,'amountCents',f.amount_cents) from public.pci_refunds f where f.voucher_id=v.id order by case f.status when 'processing' then 0 when 'pending' then 1 else 2 end,f.requested_at desc,f.id desc limit 1)) into result
 from public.pci_vouchers v join public.pci_orders o on o.id=v.order_id join auth.users u on u.id=o.purchaser_id join public.pci_restaurants r on r.id=o.restaurant_id join public.pci_menu_versions m on m.id=o.menu_version_id where v.id=p_voucher and u.id=p_user and u.email_confirmed_at is not null and o.status in ('paid','free-issued','partially-refunded','refunded');
 if result is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 select id into operation from pci_private.management_operations where voucher_id=p_voucher and purchaser_id=p_user order by completed_at desc,id desc limit 1;
 return result||jsonb_build_object('lastOperation',case when operation is null then null else pci_private.management_result(operation,true) end);
end $$;
revoke all on function pci_private.management_eligible(uuid,uuid,text),pci_private.management_context(uuid,uuid,text,text),pci_private.management_result(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.pci_auth_begin_verify(text),public.pci_auth_finish_verify(text,uuid,uuid),public.pci_management_start(uuid,uuid,text,text),public.pci_management_begin_verify(uuid,uuid,text,text),public.pci_management_finish_verify(uuid,uuid,text,text,uuid,uuid),public.pci_confirm_management(uuid,text,uuid),public.pci_read_purchaser_voucher(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_auth_begin_verify(text),public.pci_auth_finish_verify(text,uuid,uuid),public.pci_management_start(uuid,uuid,text,text),public.pci_management_begin_verify(uuid,uuid,text,text),public.pci_management_finish_verify(uuid,uuid,text,text,uuid,uuid),public.pci_read_purchaser_voucher(uuid,uuid) to service_role;
-- Legacy mutation implementations are owner-only internals. All purchaser writes must
-- commit their operation record and notification through pci_confirm_management.
revoke all on function public.pci_extend_voucher(uuid,uuid),public.pci_request_withdrawal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_confirm_management(uuid,text,uuid) to authenticated;
commit;
