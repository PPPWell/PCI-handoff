-- Limited promotions: inside a time window only, a fixed number of coupons can be issued, shared by one or more campaigns
-- (11.11: both PaStation menus together, 150 coupons, from 11.11 00:00 in Beijing to 11.11 24:00 in Italy).
-- Outside the window the campaigns are claimed as usual, without any cap. Inside it the cap is enforced here, under a per-promotion
-- lock, so concurrent claims can never issue more than the limit. A coupon someone already holds is still returned; revoked coupons
-- give their place back; the limit of two claims per account and menu is unchanged.
begin;
create table pci_private.discount_promos (
 id text primary key check(id ~ '^[a-z0-9][a-z0-9-]{1,99}$'),
 campaign_ids text[] not null check(cardinality(campaign_ids)>0),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 max_coupons integer not null check(max_coupons between 1 and 100000)
);
alter table pci_private.discount_promos enable row level security;
revoke all on pci_private.discount_promos from public,anon,authenticated,service_role;

-- Coupons issued by a promotion: inside its window, not revoked.
create function pci_private.promo_issued(promo pci_private.discount_promos) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from pci_private.discount_coupons c where c.campaign_id=any(promo.campaign_ids) and c.issued_at>=promo.starts_at and c.issued_at<promo.ends_at and c.revoked_at is null
$$;
revoke all on function pci_private.promo_issued(pci_private.discount_promos) from public,anon,authenticated,service_role;

-- State of a campaign for the claim page (public, no session): open, and the promotion (upcoming / live / ended / sold_out) with its places left when there is one.
create function public.pci_campaign_status(p_campaign text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare is_open boolean; promo pci_private.discount_promos; now_at timestamptz:=pci_private.clock_now(); issued integer; state text;
begin
 select exists(select 1 from pci_private.discount_campaigns c join public.pci_restaurants r on r.id=c.restaurant_id where c.id=p_campaign and c.status='active' and r.status='active') into is_open;
 select * into promo from pci_private.discount_promos where p_campaign=any(campaign_ids) order by starts_at desc limit 1;
 if not found then return jsonb_build_object('open',is_open);end if;
 issued:=pci_private.promo_issued(promo);
 state:=case when now_at<promo.starts_at then 'upcoming' when now_at>=promo.ends_at then 'ended' when issued>=promo.max_coupons then 'sold_out' else 'live' end;
 return jsonb_build_object('open',is_open,'promo',jsonb_build_object('state',state,'startsAt',promo.starts_at,'endsAt',promo.ends_at,'max',promo.max_coupons,'remaining',greatest(promo.max_coupons-issued,0)));
end $$;
revoke all on function public.pci_campaign_status(text) from public,anon,authenticated,service_role;
grant execute on function public.pci_campaign_status(text) to anon,authenticated;

create or replace function public.pci_claim_discount_coupon(p_campaign text,p_request uuid,p_token_hash text,p_encrypted_token text,p_language text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();campaign pci_private.discount_campaigns;existing pci_private.discount_coupons;new_id uuid;code text;bytes bytea;prior pci_private.discount_claim_requests;quota jsonb;promo pci_private.discount_promos;now_at timestamptz;
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
 -- No wait after a redemption: the next coupon can be claimed at once. Staff can still undo a redemption within two minutes; if they
 -- do, the restored coupon and the new one both count towards the two claims allowed per menu, so the limit still holds.
 perform id from public.pci_restaurants where id=campaign.restaurant_id and status='active' for share;
 if not found or campaign.status<>'active' then return jsonb_build_object('ok',false,'code','paused');end if;
 -- Limited promotion: the cap applies only while its window is open; before and after it these campaigns are claimed as usual.
 select * into promo from pci_private.discount_promos where p_campaign=any(campaign_ids) and pci_private.clock_now()>=starts_at and pci_private.clock_now()<ends_at order by starts_at desc limit 1;
 -- Each account can claim a menu twice, ever: used and expired coupons count, revoked ones do not. A coupon still held was
 -- returned above, and a request that was already answered is replayed above, so neither counts as a new claim.
 if (select count(*) from pci_private.discount_coupons where user_id=actor and campaign_id=p_campaign and revoked_at is null)>=2 then return jsonb_build_object('ok',false,'code','claim_limit');end if;
 -- The cap is checked under a lock shared by every campaign of the promotion, right before the coupon is inserted.
 if promo.id is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('discount-promo:'||promo.id,0));
  if pci_private.promo_issued(promo)>=promo.max_coupons then return jsonb_build_object('ok',false,'code','sold_out');end if;
 end if;
 loop bytes:=extensions.gen_random_bytes(4);code:=lpad((((get_byte(bytes,0)::bigint*16777216)+(get_byte(bytes,1)::bigint*65536)+(get_byte(bytes,2)::bigint*256)+get_byte(bytes,3))%1000000)::text,6,'0');code:=substr(code,1,3)||'-'||substr(code,4);exit when not exists(select 1 from pci_private.discount_coupons where short_code=code);end loop;
 insert into pci_private.discount_coupons(campaign_id,restaurant_id,user_id,claim_request,language,campaign_version,discount_cents,scope,translations,expires_on,short_code,token_hash,encrypted_token)
 values(p_campaign,campaign.restaurant_id,actor,p_request,p_language,campaign.version,campaign.discount_cents,campaign.scope,campaign.translations,((pci_private.clock_now() at time zone 'Europe/Rome')::date+make_interval(months=>campaign.validity_months))::date,code,p_token_hash,p_encrypted_token) returning id into new_id;
 insert into pci_private.discount_claim_requests values(p_request,actor,p_campaign,p_language,new_id);
 insert into pci_private.discount_events(coupon_id,kind,actor_id,request_id) values(new_id,'issued',actor,p_request);
 return pci_private.discount_owned(new_id)||jsonb_build_object('replayed',false);
end $$;

-- The 11.11 promotion: both PaStation menus share 150 coupons. 11.11 00:00 in Beijing = 10 Nov 17:00 in Italy;
-- 11.11 24:00 in Italy = 12 Nov 07:00 in Beijing.
insert into pci_private.discount_promos(id,campaign_ids,starts_at,ends_at,max_coupons)
values('double-eleven-2026',array['pastation-deluxe-1-8','pastation-deluxe-2-8'],timestamptz '2026-11-10 17:00:00+01',timestamptz '2026-11-12 00:00:00+01',150);
commit;
