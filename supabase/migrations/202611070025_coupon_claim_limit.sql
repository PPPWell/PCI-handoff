-- A menu coupon can be claimed at most twice per account. The check sits in the claim function, under the same per-account and
-- per-menu lock that already stops two claims racing, so two taps cannot both pass it.
begin;
create or replace function public.pci_claim_discount_coupon(p_campaign text,p_request uuid,p_token_hash text,p_encrypted_token text,p_language text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- Each account can claim a menu twice, ever: used and expired coupons count, revoked ones do not. A coupon still held was
 -- returned above, and a request that was already answered is replayed above, so neither counts as a new claim.
 if (select count(*) from pci_private.discount_coupons where user_id=actor and campaign_id=p_campaign and revoked_at is null)>=2 then return jsonb_build_object('ok',false,'code','claim_limit');end if;
 loop bytes:=extensions.gen_random_bytes(4);code:=lpad((((get_byte(bytes,0)::bigint*16777216)+(get_byte(bytes,1)::bigint*65536)+(get_byte(bytes,2)::bigint*256)+get_byte(bytes,3))%1000000)::text,6,'0');code:=substr(code,1,3)||'-'||substr(code,4);exit when not exists(select 1 from pci_private.discount_coupons where short_code=code);end loop;
 insert into pci_private.discount_coupons(campaign_id,restaurant_id,user_id,claim_request,language,campaign_version,discount_cents,scope,translations,expires_on,short_code,token_hash,encrypted_token)
 values(p_campaign,campaign.restaurant_id,actor,p_request,p_language,campaign.version,campaign.discount_cents,campaign.scope,campaign.translations,((pci_private.clock_now() at time zone 'Europe/Rome')::date+make_interval(months=>campaign.validity_months))::date,code,p_token_hash,p_encrypted_token) returning id into new_id;
 insert into pci_private.discount_claim_requests values(p_request,actor,p_campaign,p_language,new_id);
 insert into pci_private.discount_events(coupon_id,kind,actor_id,request_id) values(new_id,'issued',actor,p_request);
 return pci_private.discount_owned(new_id)||jsonb_build_object('replayed',false);
end $$;
commit;
