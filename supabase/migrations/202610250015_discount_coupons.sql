begin;
create table pci_private.discount_campaigns (
 id text primary key check(id ~ '^[a-z0-9][a-z0-9-]{1,99}$'), restaurant_id uuid not null references public.pci_restaurants(id), version integer not null check(version>0),
 discount_cents integer not null check(discount_cents between 1 and 99999), scope text not null default 'partner-menu' check(scope='partner-menu'),validity_months integer not null check(validity_months between 1 and 24),
 translations jsonb not null check(jsonb_typeof(translations)='object' and translations ?& array['zh','it','en']),status text not null check(status in('active','paused')),
 created_at timestamptz not null default pci_private.clock_now()
);
create table pci_private.discount_coupons (
 id uuid primary key default gen_random_uuid(),campaign_id text not null references pci_private.discount_campaigns(id),restaurant_id uuid not null references public.pci_restaurants(id),user_id uuid not null references auth.users(id),
 claim_request uuid not null unique,language text not null check(language in('zh','it','en')),campaign_version integer not null,discount_cents integer not null check(discount_cents between 1 and 99999),scope text not null check(scope='partner-menu'),translations jsonb not null,
 issued_at timestamptz not null default pci_private.clock_now(),expires_on date not null,short_code text not null unique check(short_code ~ '^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),encrypted_token text not null check(length(encrypted_token) between 40 and 1000),
 current_redemption uuid,revoked_at timestamptz
);
create index on pci_private.discount_coupons(user_id,issued_at desc,id desc);
create index on pci_private.discount_coupons(user_id,campaign_id) where current_redemption is null and revoked_at is null;
create table pci_private.discount_claim_requests(id uuid primary key,user_id uuid not null references auth.users(id),campaign_id text not null references pci_private.discount_campaigns(id),language text not null,coupon_id uuid not null references pci_private.discount_coupons(id));
create table pci_private.discount_redemptions (
 id uuid primary key,coupon_id uuid not null references pci_private.discount_coupons(id),restaurant_id uuid not null references public.pci_restaurants(id),user_id uuid not null references auth.users(id),session_id uuid not null,
 redeemed_at timestamptz not null default pci_private.clock_now(),undone_at timestamptz
);
create unique index discount_one_live_use on pci_private.discount_redemptions(coupon_id) where undone_at is null;
alter table pci_private.discount_coupons add foreign key(current_redemption) references pci_private.discount_redemptions(id);
create table pci_private.discount_events(id bigint generated always as identity primary key,coupon_id uuid not null references pci_private.discount_coupons(id),kind text not null check(kind in('issued','redeemed','undone')),actor_id uuid not null references auth.users(id),request_id uuid not null,occurred_at timestamptz not null default pci_private.clock_now());
create table pci_private.subscription_operations(id uuid primary key,user_id uuid not null references auth.users(id),email text not null,opted_in boolean not null,language text not null,policy_version text not null,source text not null,expected_revision integer not null,completed_revision integer not null);
alter table public.pci_subscribers add column revision integer not null default 0 check(revision>=0);

create function pci_private.discount_view(p_id uuid) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'serverNow',pci_private.clock_now(),'coupon',jsonb_build_object('id',c.id,'campaignId',c.campaign_id,'campaignVersion',c.campaign_version,'language',c.language,'discountCents',c.discount_cents,'scope',c.scope,'translations',c.translations,'issuedAt',c.issued_at,'expiresOn',c.expires_on,'restaurant',jsonb_build_object('id',r.id,'placeId',r.place_id,'name',r.name),
 'status',case when c.revoked_at is not null then 'revoked' when c.current_redemption is not null then 'used' when c.expires_on<(pci_private.clock_now() at time zone 'Europe/Rome')::date then 'expired' else 'unused' end,
 'shortCode',case when c.current_redemption is null and c.revoked_at is null and c.expires_on>=(pci_private.clock_now() at time zone 'Europe/Rome')::date then c.short_code else null end,'redeemedAt',d.redeemed_at)) from pci_private.discount_coupons c join public.pci_restaurants r on r.id=c.restaurant_id left join pci_private.discount_redemptions d on d.id=c.current_redemption where c.id=p_id
$$;
create function pci_private.discount_owned(p_id uuid) returns jsonb language sql volatile security definer set search_path='' as $$
 select pci_private.discount_view(c.id)||jsonb_build_object('capability',jsonb_build_object('claimRequest',c.claim_request,'tokenHash',c.token_hash,'encryptedToken',c.encrypted_token)) from pci_private.discount_coupons c where c.id=p_id
$$;
create function public.pci_claim_discount_coupon(p_campaign text,p_request uuid,p_token_hash text,p_encrypted_token text,p_language text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();campaign pci_private.discount_campaigns;existing pci_private.discount_coupons;new_id uuid;code text;bytes bytea;prior pci_private.discount_claim_requests;quota jsonb;
begin
 perform id from auth.users where id=actor and email_confirmed_at is not null and email is not null for share;if not found then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 if p_request is null or p_campaign is null or length(p_campaign)>100 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_encrypted_token is null or length(p_encrypted_token) not between 40 and 1000 or p_language is null or p_language not in('zh','it','en') then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('discount-request:'||p_request::text,0));
 select * into prior from pci_private.discount_claim_requests where id=p_request;
 if found then if prior.user_id<>actor or prior.campaign_id<>p_campaign or prior.language<>p_language then return jsonb_build_object('ok',false,'code','request_conflict');end if;return pci_private.discount_owned(prior.coupon_id)||jsonb_build_object('replayed',true);end if;
 quota:=pci_private.short_code_quota();if quota->>'ok'<>'true' then return quota;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('discount-active:'||actor::text||':'||p_campaign,0));
 select * into campaign from pci_private.discount_campaigns where id=p_campaign for share;if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select * into existing from pci_private.discount_coupons where user_id=actor and campaign_id=p_campaign and current_redemption is null and revoked_at is null and expires_on>=(pci_private.clock_now() at time zone 'Europe/Rome')::date order by issued_at desc,id desc limit 1;
 if found then insert into pci_private.discount_claim_requests values(p_request,actor,p_campaign,p_language,existing.id);return pci_private.discount_owned(existing.id)||jsonb_build_object('replayed',true);end if;
 -- A redeemed coupon may still be restored by its original staff session.
 if exists(select 1 from pci_private.discount_coupons c join pci_private.discount_redemptions d on d.id=c.current_redemption where c.user_id=actor and c.campaign_id=p_campaign and c.revoked_at is null and d.undone_at is null and d.redeemed_at+interval '2 minutes'>pci_private.clock_now()) then return jsonb_build_object('ok',false,'code','claim_wait');end if;
 perform id from public.pci_restaurants where id=campaign.restaurant_id and status='active' for share;
 if not found or campaign.status<>'active' then return jsonb_build_object('ok',false,'code','paused');end if;
 loop bytes:=extensions.gen_random_bytes(8);select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',1+get_byte(bytes,i)%32,1),'') into code from generate_series(0,7) i;code:=substr(code,1,4)||'-'||substr(code,5);exit when not exists(select 1 from pci_private.discount_coupons where short_code=code);end loop;
 insert into pci_private.discount_coupons(campaign_id,restaurant_id,user_id,claim_request,language,campaign_version,discount_cents,scope,translations,expires_on,short_code,token_hash,encrypted_token)
 values(p_campaign,campaign.restaurant_id,actor,p_request,p_language,campaign.version,campaign.discount_cents,campaign.scope,campaign.translations,((pci_private.clock_now() at time zone 'Europe/Rome')::date+make_interval(months=>campaign.validity_months))::date,code,p_token_hash,p_encrypted_token) returning id into new_id;
 insert into pci_private.discount_claim_requests values(p_request,actor,p_campaign,p_language,new_id);
 insert into pci_private.discount_events(coupon_id,kind,actor_id,request_id) values(new_id,'issued',actor,p_request);
 return pci_private.discount_owned(new_id)||jsonb_build_object('replayed',false);
end $$;
create function public.pci_my_discount_coupons(p_before_time timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;cursor_data jsonb;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 if (p_before_time is null)<>(p_before_id is null) or p_before_time is not null and not pg_catalog.isfinite(p_before_time) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 with page as(select id,issued_at from pci_private.discount_coupons where user_id=auth.uid() and (p_before_time is null or (issued_at,id)<(p_before_time,p_before_id)) order by issued_at desc,id desc limit 21),visible as(select * from page order by issued_at desc,id desc limit 20)
 select coalesce((select jsonb_agg(pci_private.discount_owned(id) order by issued_at desc,id desc) from visible),'[]'::jsonb),case when(select count(*) from page)>20 then(select jsonb_build_object('issuedAt',issued_at,'id',id) from visible order by issued_at,id limit 1) else null end into items,cursor_data;
 return jsonb_build_object('ok',true,'coupons',items,'nextCursor',cursor_data);
end $$;
create function public.pci_read_discount_coupon(p_token_hash text) returns jsonb language sql volatile security definer set search_path='' as $$
 select coalesce((select pci_private.discount_view(id) from pci_private.discount_coupons where token_hash=p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$'),jsonb_build_object('ok',false,'code','not_found'))
$$;
create function public.pci_lookup_discount_coupon(p_token_hash text default null,p_short_code text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.discount_coupons;quota jsonb;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 quota:=pci_private.short_code_quota();if quota->>'ok'<>'true' then return quota;end if;
 if (p_token_hash is null)=(p_short_code is null) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 select * into c from pci_private.discount_coupons where (token_hash=p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$') or (short_code=p_short_code and p_short_code ~ '^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$');
 if not found or not pci_private.lock_merchant(c.restaurant_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if c.current_redemption is not null and exists(select 1 from pci_private.discount_redemptions where id=c.current_redemption and user_id=auth.uid() and session_id=pci_private.merchant_session()) then return pci_private.discount_receipt(c.current_redemption,true);end if;
 return pci_private.discount_view(c.id)||jsonb_build_object('redemption',null);
end $$;
create function pci_private.discount_receipt(p_id uuid,p_replayed boolean) returns jsonb language sql volatile security definer set search_path='' as $$
 select pci_private.discount_view(d.coupon_id)||jsonb_build_object('replayed',p_replayed,'redemption',jsonb_build_object('id',d.id,'couponId',d.coupon_id,'redeemedAt',d.redeemed_at,'undoUntil',d.redeemed_at+interval '2 minutes','undoneAt',d.undone_at)) from pci_private.discount_redemptions d where d.id=p_id
$$;
create function public.pci_redeem_discount_coupon(p_coupon uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c pci_private.discount_coupons;d pci_private.discount_redemptions;
begin
 select * into c from pci_private.discount_coupons where id=p_coupon;if not found or not pci_private.lock_merchant(c.restaurant_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_request is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('discount-redeem:'||p_request::text,0));
 select * into c from pci_private.discount_coupons where id=p_coupon for update;
 select * into d from pci_private.discount_redemptions where id=p_request;
 if found then if d.coupon_id<>p_coupon or d.user_id<>auth.uid() or d.session_id<>pci_private.merchant_session() then return jsonb_build_object('ok',false,'code','request_conflict');end if;return pci_private.discount_receipt(d.id,true);end if;
 if c.current_redemption is not null then return jsonb_build_object('ok',false,'code','already_used');end if;
 if c.revoked_at is not null then return jsonb_build_object('ok',false,'code','revoked');end if;
 if c.expires_on<(pci_private.clock_now() at time zone 'Europe/Rome')::date then return jsonb_build_object('ok',false,'code','expired');end if;
 insert into pci_private.discount_redemptions(id,coupon_id,restaurant_id,user_id,session_id) values(p_request,c.id,c.restaurant_id,auth.uid(),pci_private.merchant_session());
 update pci_private.discount_coupons set current_redemption=p_request where id=c.id;
 insert into pci_private.discount_events(coupon_id,kind,actor_id,request_id)values(c.id,'redeemed',auth.uid(),p_request);
 return pci_private.discount_receipt(p_request,false);
end $$;
create function public.pci_undo_discount_coupon(p_redemption uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d pci_private.discount_redemptions;c pci_private.discount_coupons;
begin
 select * into d from pci_private.discount_redemptions where id=p_redemption;
 if not found or d.user_id<>auth.uid() or d.session_id<>pci_private.merchant_session() or not pci_private.lock_merchant(d.restaurant_id) then return jsonb_build_object('ok',false,'code','not_found');end if;
 -- Same ordering boundary as claiming; re-check coupon state after waiting.
 select * into c from pci_private.discount_coupons where id=d.coupon_id;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('discount-active:'||c.user_id::text||':'||c.campaign_id,0));
 select * into c from pci_private.discount_coupons where id=d.coupon_id for update;
 select * into d from pci_private.discount_redemptions where id=p_redemption for update;
 if d.undone_at is not null then return pci_private.discount_receipt(d.id,true);end if;
 if d.redeemed_at+interval '2 minutes'<=pci_private.clock_now() then return jsonb_build_object('ok',false,'code','undo_closed');end if;
 if c.current_redemption is distinct from d.id then return jsonb_build_object('ok',false,'code','state_changed');end if;
 update pci_private.discount_redemptions set undone_at=pci_private.clock_now() where id=d.id;
 update pci_private.discount_coupons set current_redemption=null where id=c.id;
 insert into pci_private.discount_events(coupon_id,kind,actor_id,request_id) values(c.id,'undone',auth.uid(),d.id);
 return pci_private.discount_receipt(d.id,false);
end $$;
create function public.pci_subscription_preferences() returns jsonb language plpgsql security definer set search_path='' as $$
declare email_address text;s public.pci_subscribers;
begin
 select lower(btrim(email)) into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null and email is not null;
 if not found then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 select * into s from public.pci_subscribers where email=email_address;
 return jsonb_build_object('ok',true,'preferences',jsonb_build_object('email',email_address,'subscribed',coalesce(s.status='confirmed',false),'revision',coalesce(s.revision,0),'language',coalesce(s.language,'zh')));
end $$;
create function public.pci_set_subscription(p_request uuid,p_opt_in boolean,p_language text,p_policy_version text,p_source text,p_expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();email_address text;s public.pci_subscribers;op pci_private.subscription_operations;next_revision integer;
begin
 select lower(btrim(email)) into email_address from auth.users where id=actor and email_confirmed_at is not null and email is not null for share;
 if not found then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 if p_request is null or p_opt_in is null or p_language is null or p_language not in('zh','it','en') or p_policy_version is distinct from 'newsletter-v1' or p_source is null or p_source not in('subscription-page','account','coupon-claim') or p_expected_revision is null or p_expected_revision<0 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription-request:'||p_request::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription-email:'||email_address,0));
 select * into op from pci_private.subscription_operations where id=p_request;
 if found then if op.user_id<>actor or op.email<>email_address or op.opted_in<>p_opt_in or op.language<>p_language or op.policy_version<>p_policy_version or op.source<>p_source or op.expected_revision<>p_expected_revision then return jsonb_build_object('ok',false,'code','request_conflict');end if;return public.pci_subscription_preferences()||jsonb_build_object('replayed',true);end if;
 select * into s from public.pci_subscribers where email=email_address for update;
 if coalesce(s.revision,0)<>p_expected_revision then return jsonb_build_object('ok',false,'code','state_changed');end if;
 next_revision:=coalesce(s.revision,0)+1;
 insert into public.pci_subscribers(user_id,email,language,status,confirmed_at,unsubscribed_at,revision)
 values(actor,email_address,p_language,case when p_opt_in then 'confirmed' else 'unsubscribed' end,case when p_opt_in then pci_private.clock_now() end,case when not p_opt_in then pci_private.clock_now() end,next_revision)
 on conflict(email) do update set user_id=excluded.user_id,language=excluded.language,status=excluded.status,confirmed_at=case when p_opt_in then pci_private.clock_now() else pci_subscribers.confirmed_at end,unsubscribed_at=excluded.unsubscribed_at,revision=next_revision;
 if not p_opt_in then update public.pci_consent_records set revoked_at=pci_private.clock_now() where user_id=actor and email=email_address and type='marketing' and opted_in and revoked_at is null;end if;
 insert into public.pci_consent_records(user_id,email,type,opted_in,language,policy_version,source) values(actor,email_address,'marketing',p_opt_in,p_language,p_policy_version,p_source);
 insert into pci_private.subscription_operations values(p_request,actor,email_address,p_opt_in,p_language,p_policy_version,p_source,p_expected_revision,next_revision);
 return public.pci_subscription_preferences()||jsonb_build_object('replayed',false);
end $$;

alter table pci_private.discount_claim_requests enable row level security;
alter table pci_private.discount_campaigns enable row level security;
alter table pci_private.discount_coupons enable row level security;
alter table pci_private.discount_redemptions enable row level security;
alter table pci_private.discount_events enable row level security;
alter table pci_private.subscription_operations enable row level security;
revoke all on pci_private.discount_claim_requests,pci_private.discount_campaigns,pci_private.discount_coupons,pci_private.discount_redemptions,pci_private.discount_events,pci_private.subscription_operations from public,anon,authenticated,service_role;
revoke all on function pci_private.discount_view(uuid),pci_private.discount_owned(uuid),pci_private.discount_receipt(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.pci_claim_discount_coupon(text,uuid,text,text,text),public.pci_my_discount_coupons(timestamptz,uuid),public.pci_read_discount_coupon(text),public.pci_lookup_discount_coupon(text,text),public.pci_redeem_discount_coupon(uuid,uuid),public.pci_undo_discount_coupon(uuid),public.pci_subscription_preferences(),public.pci_set_subscription(uuid,boolean,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.pci_claim_discount_coupon(text,uuid,text,text,text),public.pci_my_discount_coupons(timestamptz,uuid),public.pci_lookup_discount_coupon(text,text),public.pci_redeem_discount_coupon(uuid,uuid),public.pci_undo_discount_coupon(uuid),public.pci_subscription_preferences(),public.pci_set_subscription(uuid,boolean,text,text,text,integer) to authenticated;
grant execute on function public.pci_read_discount_coupon(text) to service_role;
commit;
