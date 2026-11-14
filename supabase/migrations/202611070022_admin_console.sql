-- Admin console (platform admin only): see each restaurant with its owners and coupon campaigns, open a campaign for a
-- restaurant from the repository content (creating the restaurant and its owner membership when missing), and pause or
-- resume a campaign. This replaces running the generated pastation-setup.sql by hand. Every change is logged in
-- pci_private.admin_events. Owners must have signed in once (verified email) before they can be named.
-- Owners can also add and remove their own staff by email (pci_owner_staff / pci_owner_set_staff): a staff member signs in
-- with their own email instead of borrowing the owner's inbox, and loses access as soon as they are removed.
begin;
create table pci_private.admin_events(
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 action text not null check(action in('setup-campaign','campaign-status','staff')),
 detail jsonb not null,
 occurred_at timestamptz not null default pci_private.clock_now()
);
alter table pci_private.admin_events enable row level security;

create function public.pci_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare restaurants jsonb;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'placeId',r.place_id,'name',r.name,'status',r.status,
   'owners',(select coalesce(jsonb_agg(u.email order by u.email),'[]'::jsonb) from public.pci_restaurant_members m join auth.users u on u.id=m.user_id where m.restaurant_id=r.id and m.role='owner' and m.active),
   'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'discountCents',c.discount_cents,'validityMonths',c.validity_months,'version',c.version) order by c.id),'[]'::jsonb) from pci_private.discount_campaigns c where c.restaurant_id=r.id)
  ) order by r.name),'[]'::jsonb) into restaurants from public.pci_restaurants r;
 return jsonb_build_object('ok',true,'restaurants',restaurants);
end $$;

-- Same checks as the generated setup SQL, returned as codes instead of exceptions so the page can explain them.
create function public.pci_admin_setup_campaign(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; r public.pci_restaurants; c pci_private.discount_campaigns; owner_email text;
begin
 if actor is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p is null or jsonb_typeof(p)<>'object'
  or coalesce(p->>'placeId','')!~'^[a-z0-9][a-z0-9-]{1,99}$' or coalesce(p->>'campaignId','')!~'^[a-z0-9][a-z0-9-]{1,99}$'
  or length(btrim(coalesce(p->>'name','')))=0 or length(p->>'name')>200
  or coalesce(p->>'version','')!~'^[1-9][0-9]{0,5}$' or coalesce(p->>'discountCents','')!~'^[1-9][0-9]{0,4}$' or coalesce(p->>'validityMonths','')!~'^[1-9][0-9]?$'
  or (p->>'validityMonths')::integer>24 or jsonb_typeof(p->'translations')<>'object' or not (p->'translations' ?& array['zh','it','en'])
 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
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
 -- Required for device/PIN management only. Preserve every existing financial setting.
 insert into pci_private.restaurant_settings(restaurant_id,commission_bps,commission_vat_bps)values(r.id,0,0)on conflict do nothing;
 select * into c from pci_private.discount_campaigns where id=p->>'campaignId' for update;
 if not found then
  insert into pci_private.discount_campaigns(id,restaurant_id,version,discount_cents,scope,validity_months,translations,status)
  values(p->>'campaignId',r.id,(p->>'version')::integer,(p->>'discountCents')::integer,'partner-menu',(p->>'validityMonths')::integer,p->'translations','active');
 elsif c.restaurant_id<>r.id or c.version<>(p->>'version')::integer or c.discount_cents<>(p->>'discountCents')::integer or c.validity_months<>(p->>'validityMonths')::integer or c.translations<>p->'translations' then
  return jsonb_build_object('ok',false,'code','campaign_differs');
 else return jsonb_build_object('ok',true,'restaurantId',r.id,'created',false);end if;
 insert into pci_private.admin_events(actor_id,action,detail)values(actor,'setup-campaign',jsonb_build_object('campaignId',p->>'campaignId','placeId',p->>'placeId','ownerId',owner_id));
 return jsonb_build_object('ok',true,'restaurantId',r.id,'created',true);
end $$;

create function public.pci_admin_set_campaign_status(p_campaign text,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c pci_private.discount_campaigns;
begin
 if actor is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_campaign is null or p_status is null or p_status not in('active','paused') then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 select * into c from pci_private.discount_campaigns where id=p_campaign for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 if c.status<>p_status then
  update pci_private.discount_campaigns set status=p_status where id=p_campaign;
  insert into pci_private.admin_events(actor_id,action,detail)values(actor,'campaign-status',jsonb_build_object('campaignId',p_campaign,'from',c.status,'to',p_status));
 end if;
 return jsonb_build_object('ok',true,'status',p_status);
end $$;

revoke all on function public.pci_admin_overview(),public.pci_admin_setup_campaign(jsonb),public.pci_admin_set_campaign_status(text,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_admin_overview(),public.pci_admin_setup_campaign(jsonb),public.pci_admin_set_campaign_status(text,text) to authenticated;
create function public.pci_owner_staff(p_restaurant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_restaurant is null or not pci_private.is_merchant(p_restaurant,true) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 return jsonb_build_object('ok',true,'staff',(select coalesce(jsonb_agg(jsonb_build_object('email',u.email,'active',m.active) order by m.active desc,u.email),'[]'::jsonb)
  from public.pci_restaurant_members m join auth.users u on u.id=m.user_id where m.restaurant_id=p_restaurant and m.role='staff'));
end $$;

create function public.pci_owner_set_staff(p_restaurant uuid,p_email text,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); member uuid; staff_email text:=lower(btrim(coalesce(p_email,'')));
begin
 if actor is null or p_restaurant is null or p_active is null or not pci_private.is_merchant(p_restaurant,true) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if staff_email!~'^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(staff_email)>254 then return jsonb_build_object('ok',false,'code','invalid_email');end if;
 select u.id into member from auth.users u where lower(btrim(u.email))=staff_email and u.email_confirmed_at is not null;
 if member is null then return jsonb_build_object('ok',false,'code','staff_not_verified');end if;
 if exists(select 1 from public.pci_restaurant_members where restaurant_id=p_restaurant and user_id=member and role='owner') then return jsonb_build_object('ok',false,'code','owner_differs');end if;
 insert into public.pci_restaurant_members(restaurant_id,user_id,role,active)values(p_restaurant,member,'staff',p_active)
 on conflict(restaurant_id,user_id) do update set active=excluded.active;
 insert into pci_private.admin_events(actor_id,action,detail)values(actor,'staff',jsonb_build_object('restaurantId',p_restaurant,'staffId',member,'active',p_active));
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.pci_owner_staff(uuid),public.pci_owner_set_staff(uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.pci_owner_staff(uuid),public.pci_owner_set_staff(uuid,text,boolean) to authenticated;

-- Replaces the 0021 report: "registered users" now counts customers only.
create or replace function public.pci_platform_report(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date;since timestamptz;start_today timestamptz;restaurants jsonb;users jsonb;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_days is null or p_days not between 1 and 365 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 today:=(pci_private.clock_now() at time zone 'Europe/Rome')::date;
 start_today:=today::timestamp at time zone 'Europe/Rome';
 since:=(today-(p_days-1))::timestamp at time zone 'Europe/Rome';
 select jsonb_build_object(
   'total',count(*) filter(where u.email_confirmed_at is not null),
   'period',count(*) filter(where u.email_confirmed_at>=since),
   'today',count(*) filter(where u.email_confirmed_at>=start_today)
 ) into users from auth.users u
 -- Customers only: platform and restaurant accounts are not sign-ups.
 where not exists(select 1 from pci_private.platform_members p where p.user_id=u.id)
   and not exists(select 1 from public.pci_restaurant_members m where m.user_id=u.id);
 with uses as(
  select d.restaurant_id,d.redeemed_at from pci_private.discount_redemptions d where d.undone_at is null
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'restaurantId',r.id,'name',r.name,'status',r.status,
   'claimed',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=r.id),
   'used',(select count(*) from uses u where u.restaurant_id=r.id),
   'claimedPeriod',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=r.id and c.issued_at>=since),
   'usedPeriod',(select count(*) from uses u where u.restaurant_id=r.id and u.redeemed_at>=since),
   'claimedToday',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=r.id and c.issued_at>=start_today),
   'usedToday',(select count(*) from uses u where u.restaurant_id=r.id and u.redeemed_at>=start_today)
  ) order by r.name),'[]'::jsonb) into restaurants from public.pci_restaurants r;
 return jsonb_build_object('ok',true,'date',today,'days',p_days,'users',users,'restaurants',restaurants);
end $$;

-- Whether a campaign takes new claims, so the claim page can say "paused" before asking for an email. Public: it reveals
-- nothing beyond what the claim attempt itself would answer.
create function public.pci_campaign_open(p_campaign text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pci_private.discount_campaigns c join public.pci_restaurants r on r.id=c.restaurant_id where c.id=p_campaign and c.status='active' and r.status='active')
$$;
revoke all on function public.pci_campaign_open(text) from public,anon,authenticated,service_role;
grant execute on function public.pci_campaign_open(text) to anon,authenticated;

commit;
