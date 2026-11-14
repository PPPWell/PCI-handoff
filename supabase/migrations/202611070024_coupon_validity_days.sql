-- Coupon campaigns can run for a number of days instead of months (PaStation: 7 days from claiming). A campaign has
-- exactly one of the two. The expiry date is set when the coupon is issued: claiming (unchanged) computes it from
-- months; for a campaign in days the trigger below replaces it. Coupons already issued keep the date printed on them.
begin;
alter table pci_private.discount_campaigns alter column validity_months drop not null;
alter table pci_private.discount_campaigns add column validity_days integer check(validity_days between 1 and 366);
alter table pci_private.discount_campaigns add constraint discount_campaigns_one_validity check((validity_months is null)<>(validity_days is null));

create function pci_private.discount_coupon_expiry() returns trigger language plpgsql security definer set search_path='' as $$
declare days integer;
begin
 select validity_days into days from pci_private.discount_campaigns where id=new.campaign_id;
 if days is not null then new.expires_on:=(new.issued_at at time zone 'Europe/Rome')::date+days;end if;
 return new;
end $$;
revoke all on function pci_private.discount_coupon_expiry() from public,anon,authenticated,service_role;
create trigger discount_coupon_expiry before insert on pci_private.discount_coupons for each row execute function pci_private.discount_coupon_expiry();

-- The two PaStation menus move from 6 months to 7 days (content/offers/pastation-deluxe-*.yaml).
update pci_private.discount_campaigns set validity_months=null,validity_days=7 where id in('pastation-deluxe-1-8','pastation-deluxe-2-8');

-- Admin console: report and open campaigns in days or months, as the content defines them.
create or replace function public.pci_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare restaurants jsonb;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'placeId',r.place_id,'name',r.name,'status',r.status,
   'owners',(select coalesce(jsonb_agg(u.email order by u.email),'[]'::jsonb) from public.pci_restaurant_members m join auth.users u on u.id=m.user_id where m.restaurant_id=r.id and m.role='owner' and m.active),
   'campaigns',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',c.id,'status',c.status,'discountCents',c.discount_cents,'validityMonths',c.validity_months,'validityDays',c.validity_days,'version',c.version)) order by c.id),'[]'::jsonb) from pci_private.discount_campaigns c where c.restaurant_id=r.id)
  ) order by r.name),'[]'::jsonb) into restaurants from public.pci_restaurants r;
 return jsonb_build_object('ok',true,'restaurants',restaurants);
end $$;

create or replace function public.pci_admin_setup_campaign(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; r public.pci_restaurants; c pci_private.discount_campaigns; owner_email text; months integer; days integer;
begin
 if actor is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p is null or jsonb_typeof(p)<>'object'
  or coalesce(p->>'placeId','')!~'^[a-z0-9][a-z0-9-]{1,99}$' or coalesce(p->>'campaignId','')!~'^[a-z0-9][a-z0-9-]{1,99}$'
  or length(btrim(coalesce(p->>'name','')))=0 or length(p->>'name')>200
  or coalesce(p->>'version','')!~'^[1-9][0-9]{0,5}$' or coalesce(p->>'discountCents','')!~'^[1-9][0-9]{0,4}$'
  or (p ? 'validityMonths')=(p ? 'validityDays')
  or (p ? 'validityMonths' and (coalesce(p->>'validityMonths','')!~'^[1-9][0-9]?$' or (p->>'validityMonths')::integer>24))
  or (p ? 'validityDays' and (coalesce(p->>'validityDays','')!~'^[1-9][0-9]{0,2}$' or (p->>'validityDays')::integer>366))
  or jsonb_typeof(p->'translations')<>'object' or not (p->'translations' ?& array['zh','it','en'])
 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 months:=(p->>'validityMonths')::integer; days:=(p->>'validityDays')::integer;
 owner_email:=lower(btrim(coalesce(p->>'ownerEmail','')));
 if owner_email!~'^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(owner_email)>254 then return jsonb_build_object('ok',false,'code','invalid_email');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coupon-setup:'||(p->>'campaignId'),0));
 select u.id into owner_id from auth.users u where lower(btrim(u.email))=owner_email and email_confirmed_at is not null;
 if owner_id is null then return jsonb_build_object('ok',false,'code','owner_not_verified');end if;
 select * into r from public.pci_restaurants where place_id=p->>'placeId' for update;
 if not found then
  insert into public.pci_restaurants(place_id,name,sales_mode,status)values(p->>'placeId',p->>'name','pay-at-restaurant','active')returning * into r;
 elsif r.sales_mode<>'pay-at-restaurant' or r.status<>'active' then return jsonb_build_object('ok',false,'code','restaurant_differs');end if;
 if exists(select 1 from public.pci_restaurant_members where restaurant_id=r.id and (user_id=owner_id and (role<>'owner' or not active) or user_id<>owner_id and role='owner' and active)) then
  return jsonb_build_object('ok',false,'code','owner_differs');end if;
 insert into public.pci_restaurant_members(restaurant_id,user_id,role)values(r.id,owner_id,'owner')on conflict do nothing;
 insert into pci_private.restaurant_settings(restaurant_id,commission_bps,commission_vat_bps)values(r.id,0,0)on conflict do nothing;
 select * into c from pci_private.discount_campaigns where id=p->>'campaignId' for update;
 if not found then
  insert into pci_private.discount_campaigns(id,restaurant_id,version,discount_cents,scope,validity_months,validity_days,translations,status)
  values(p->>'campaignId',r.id,(p->>'version')::integer,(p->>'discountCents')::integer,'partner-menu',months,days,p->'translations','active');
 elsif c.restaurant_id<>r.id or c.version<>(p->>'version')::integer or c.discount_cents<>(p->>'discountCents')::integer
  or c.validity_months is distinct from months or c.validity_days is distinct from days or c.translations<>p->'translations' then
  return jsonb_build_object('ok',false,'code','campaign_differs');
 else return jsonb_build_object('ok',true,'restaurantId',r.id,'created',false);end if;
 insert into pci_private.admin_events(actor_id,action,detail)values(actor,'setup-campaign',jsonb_build_object('campaignId',p->>'campaignId','placeId',p->>'placeId','ownerId',owner_id));
 return jsonb_build_object('ok',true,'restaurantId',r.id,'created',true);
end $$;
commit;
