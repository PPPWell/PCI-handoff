begin;
create table pci_private.email_auth_limits (
 email text primary key check(email=lower(btrim(email)) and length(email)<=254),
 last_sent_at timestamptz,
 verify_attempts integer not null default 0 check(verify_attempts between 0 and 5),
 locked_until timestamptz,
 updated_at timestamptz not null default pci_private.clock_now()
);
create table pci_private.email_auth_challenges (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 email text not null references pci_private.email_auth_limits(email),
 status text not null default 'created' check(status in ('created','sent','failed','superseded','verified')),
 created_at timestamptz not null default pci_private.clock_now(),
 expires_at timestamptz not null default pci_private.clock_now()+interval '10 minutes',
 lease_id uuid,lease_until timestamptz,
 verified_user uuid references auth.users(id),verified_at timestamptz,
 check((status='verified')=(verified_user is not null and verified_at is not null))
);
create index on pci_private.email_auth_challenges(email);
create index on pci_private.email_auth_challenges(created_at);
alter table pci_private.email_auth_limits enable row level security;
alter table pci_private.email_auth_challenges enable row level security;
revoke all on pci_private.email_auth_limits,pci_private.email_auth_challenges from public,anon,authenticated,service_role;
create function public.pci_auth_start(p_email text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare lim pci_private.email_auth_limits;now_at timestamptz=pci_private.clock_now();
begin
 if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 insert into pci_private.email_auth_limits(email) values(p_email) on conflict do nothing;
 select * into lim from pci_private.email_auth_limits where email=p_email for update;
 if lim.locked_until>now_at then return jsonb_build_object('ok',false,'code','verification_locked','retryAt',lim.locked_until);end if;
 if lim.last_sent_at>now_at-interval '60 seconds' then return jsonb_build_object('ok',false,'code','send_cooldown','retryAt',lim.last_sent_at+interval '60 seconds');end if;
 if exists(select 1 from pci_private.email_auth_challenges where email=p_email and lease_until>now_at) then return jsonb_build_object('ok',false,'code','verification_busy');end if;
 update pci_private.email_auth_challenges set status='superseded',lease_id=null,lease_until=null where email=p_email and status in ('created','sent');
 update pci_private.email_auth_limits set last_sent_at=now_at,updated_at=now_at,verify_attempts=case when locked_until is not null then 0 else verify_attempts end,locked_until=null where email=p_email;
 insert into pci_private.email_auth_challenges(token_hash,email,created_at,expires_at) values(p_hash,p_email,now_at,now_at+interval '10 minutes');
 return jsonb_build_object('ok',true,'expiresAt',now_at+interval '10 minutes','retryAt',now_at+interval '60 seconds');
end $$;
create function public.pci_auth_mark_sent(p_hash text,p_sent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update pci_private.email_auth_challenges set status=case when p_sent then 'sent' else 'failed' end where token_hash=p_hash and status='created';
 return jsonb_build_object('ok',found);
end $$;
create function public.pci_auth_begin_verify(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.email_auth_challenges;lim pci_private.email_auth_limits;now_at timestamptz=pci_private.clock_now();email_value text;lease uuid=gen_random_uuid();n integer;
begin
 select email into email_value from pci_private.email_auth_challenges where token_hash=p_hash;
 if not found then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 -- All send/verification writers take the email limit before a challenge row.
 select * into lim from pci_private.email_auth_limits where email=email_value for update;
 select * into c from pci_private.email_auth_challenges where token_hash=p_hash for update;
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
create function public.pci_auth_finish_verify(p_hash text,p_lease uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.email_auth_challenges;lim pci_private.email_auth_limits;now_at timestamptz=pci_private.clock_now();email_value text;
begin
 select email into email_value from pci_private.email_auth_challenges where token_hash=p_hash;
 if not found then return jsonb_build_object('ok',false,'code','invalid_challenge');end if;
 select * into lim from pci_private.email_auth_limits where email=email_value for update;
 select * into c from pci_private.email_auth_challenges where token_hash=p_hash for update;
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
create function pci_private.cleanup_email_auth() returns void language plpgsql security definer set search_path='' as $$
declare email_value text;cutoff timestamptz=pci_private.clock_now()-interval '24 hours';
begin
 -- Retention uses the same email -> challenge lock order as send/verify; active emails are retried tomorrow.
 for email_value in select l.email from pci_private.email_auth_limits l where l.updated_at<cutoff or exists(select 1 from pci_private.email_auth_challenges c where c.email=l.email and c.created_at<cutoff) order by l.email for update of l skip locked loop
  delete from pci_private.email_auth_challenges where email=email_value and created_at<cutoff and (lease_until is null or lease_until<pci_private.clock_now());
  delete from pci_private.email_auth_limits l where l.email=email_value and l.updated_at<cutoff and not exists(select 1 from pci_private.email_auth_challenges c where c.email=l.email);
 end loop;
end $$;
alter function public.pci_run_voucher_maintenance() set schema pci_private;
revoke all on function pci_private.pci_run_voucher_maintenance() from public,anon,authenticated,service_role;
create function public.pci_run_voucher_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform pci_private.cleanup_email_auth();return pci_private.pci_run_voucher_maintenance();end $$;
create function public.pci_load_purchaser_account(p_user uuid,p_before_time timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare verified_email text;result jsonb;now_at timestamptz=pci_private.clock_now();
begin
 select lower(btrim(email)) into verified_email from auth.users where id=p_user and email_confirmed_at is not null;
 if verified_email is null then return jsonb_build_object('ok',false,'code','email_verification_required');end if;
 if (p_before_time is null)<>(p_before_id is null) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 update public.pci_orders o set purchaser_id=p_user from pci_private.order_contacts c where c.order_id=o.id and c.email=verified_email and o.purchaser_id is null and o.status in ('paid','free-issued','partially-refunded','refunded');
 with selected as (
  select o.* from public.pci_orders o where o.purchaser_id=p_user and o.status in ('paid','free-issued','partially-refunded','refunded') and (p_before_time is null or (o.purchased_at,o.id)<(p_before_time,p_before_id)) order by o.purchased_at desc,o.id desc limit 21
 ),shown as (select * from selected order by purchased_at desc,id desc limit 20),rows as (
  select o.purchased_at,o.id,jsonb_build_object('id',o.id,'purchasedAt',o.purchased_at,'quantity',o.quantity,'language',o.language,'restaurant',jsonb_build_object('id',r.id,'name',r.name),'menu',jsonb_build_object('version',m.version,'people',m.people,'translations',m.translations),
   'vouchers',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'status',v.status,'expiresOn',v.expires_on,'redeemedAt',v.redeemed_at,'extendedOnce',v.extended_once,'usable',v.status in ('unused','extended') and v.expires_on>=(now_at at time zone 'Europe/Rome')::date and not exists(select 1 from public.pci_refunds f where f.voucher_id=v.id and f.status='processing')) order by v.id),'[]'::jsonb) from public.pci_vouchers v where v.order_id=o.id),
   'capability',(select jsonb_build_object('encryptedToken',c.encrypted_token,'tokenHash',c.token_hash) from pci_private.capabilities c where c.order_id=o.id and c.voucher_id is null and c.revoked_at is null order by c.created_at desc,c.id desc limit 1)
  ) value from shown o join public.pci_restaurants r on r.id=o.restaurant_id join public.pci_menu_versions m on m.id=o.menu_version_id
 )
 select jsonb_build_object('ok',true,'serverNow',now_at,'orders',(select coalesce(jsonb_agg(value order by purchased_at desc,id desc),'[]'::jsonb) from rows),
  'nextCursor',case when (select count(*) from selected)>20 then (select jsonb_build_object('purchasedAt',purchased_at,'id',id) from shown order by purchased_at,id limit 1) else null end) into result;
 return result;
end $$;
revoke all on function pci_private.cleanup_email_auth() from public,anon,authenticated,service_role;
revoke all on function public.pci_auth_start(text,text),public.pci_auth_mark_sent(text,boolean),public.pci_auth_begin_verify(text),public.pci_auth_finish_verify(text,uuid,uuid),public.pci_load_purchaser_account(uuid,timestamptz,uuid),public.pci_run_voucher_maintenance() from public,anon,authenticated,service_role;
grant execute on function public.pci_auth_start(text,text),public.pci_auth_mark_sent(text,boolean),public.pci_auth_begin_verify(text),public.pci_auth_finish_verify(text,uuid,uuid),public.pci_load_purchaser_account(uuid,timestamptz,uuid),public.pci_run_voucher_maintenance() to service_role;
commit;
