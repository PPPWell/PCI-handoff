-- Invite instead of "sign in once first": the admin names the owner's email; if that person has not signed in yet, the restaurant and
-- its menus open at once and the email is kept as an invite. At the owner's first sign-in the invite becomes ownership (the same
-- hand-over as pci_admin_transfer_owner: earlier owners are switched off, staff stay). One pending invite per restaurant.
begin;
create table pci_private.owner_invites(
 restaurant_id uuid primary key references public.pci_restaurants(id),
 email text not null check(email ~ '^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$' and length(email)<=254),
 invited_by uuid references auth.users(id),
 created_at timestamptz not null default pci_private.clock_now()
);
alter table pci_private.owner_invites enable row level security;
revoke all on pci_private.owner_invites from public,anon,authenticated,service_role;

create or replace function public.pci_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare restaurants jsonb;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'placeId',r.place_id,'name',r.name,'status',r.status,
   'invite',(select i.email from pci_private.owner_invites i where i.restaurant_id=r.id),'owners',(select coalesce(jsonb_agg(u.email order by u.email),'[]'::jsonb) from public.pci_restaurant_members m join auth.users u on u.id=m.user_id where m.restaurant_id=r.id and m.role='owner' and m.active),
   'campaigns',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',c.id,'status',c.status,'discountCents',c.discount_cents,'validityMonths',c.validity_months,'validityDays',c.validity_days,'version',c.version)) order by c.id),'[]'::jsonb) from pci_private.discount_campaigns c where c.restaurant_id=r.id)
  ) order by r.name),'[]'::jsonb) into restaurants from public.pci_restaurants r;
 return jsonb_build_object('ok',true,'restaurants',restaurants);
end $$;

create or replace function public.pci_admin_setup_campaign(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; r public.pci_restaurants; c pci_private.discount_campaigns; owner_email text; months integer; days integer; pending boolean;
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
 -- An owner who has not signed in yet is invited: the restaurant opens now, and the invite turns into ownership at their first sign-in.
 pending:=owner_id is null;
 select * into r from public.pci_restaurants where place_id=p->>'placeId' for update;
 if not found then
  insert into public.pci_restaurants(place_id,name,sales_mode,status)values(p->>'placeId',p->>'name','pay-at-restaurant','active')returning * into r;
 elsif r.sales_mode<>'pay-at-restaurant' or r.status<>'active' then return jsonb_build_object('ok',false,'code','restaurant_differs');end if;
 if exists(select 1 from public.pci_restaurant_members where restaurant_id=r.id and (user_id=owner_id and (role<>'owner' or not active) or user_id<>owner_id and role='owner' and active)) then
  return jsonb_build_object('ok',false,'code','owner_differs');end if;
 if pending and exists(select 1 from public.pci_restaurant_members where restaurant_id=r.id and role='owner' and active) then return jsonb_build_object('ok',false,'code','owner_differs');end if;
 if pending then
  insert into pci_private.owner_invites(restaurant_id,email,invited_by)values(r.id,owner_email,actor)on conflict(restaurant_id) do update set email=excluded.email,invited_by=excluded.invited_by,created_at=pci_private.clock_now();
 else
  insert into public.pci_restaurant_members(restaurant_id,user_id,role)values(r.id,owner_id,'owner')on conflict do nothing;
 end if;
 insert into pci_private.restaurant_settings(restaurant_id,commission_bps,commission_vat_bps)values(r.id,0,0)on conflict do nothing;
 select * into c from pci_private.discount_campaigns where id=p->>'campaignId' for update;
 if not found then
  insert into pci_private.discount_campaigns(id,restaurant_id,version,discount_cents,scope,validity_months,validity_days,translations,status)
  values(p->>'campaignId',r.id,(p->>'version')::integer,(p->>'discountCents')::integer,'partner-menu',months,days,p->'translations','active');
 elsif c.restaurant_id<>r.id or c.version<>(p->>'version')::integer or c.discount_cents<>(p->>'discountCents')::integer
  or c.validity_months is distinct from months or c.validity_days is distinct from days or c.translations<>p->'translations' then
  return jsonb_build_object('ok',false,'code','campaign_differs');
 else return jsonb_build_object('ok',true,'restaurantId',r.id,'created',false,'invited',pending);end if;
 insert into pci_private.admin_events(actor_id,action,detail)values(actor,'setup-campaign',jsonb_build_object('campaignId',p->>'campaignId','placeId',p->>'placeId','ownerId',owner_id));
 return jsonb_build_object('ok',true,'restaurantId',r.id,'created',true,'invited',pending);
end $$;

create or replace function public.pci_admin_transfer_owner(p_restaurant uuid,p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); new_owner uuid; owner_email text:=lower(btrim(coalesce(p_email,''))); previous uuid[];
begin
 if actor is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_restaurant is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if owner_email!~'^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(owner_email)>254 then return jsonb_build_object('ok',false,'code','invalid_email');end if;
 perform 1 from public.pci_restaurants where id=p_restaurant for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select u.id into new_owner from auth.users u where lower(btrim(u.email))=owner_email and u.email_confirmed_at is not null;
 if new_owner is null then
  -- Not signed in yet: keep the current owner until the new one arrives, then hand over (pci_claim_owner_invites).
  insert into pci_private.owner_invites(restaurant_id,email,invited_by)values(p_restaurant,owner_email,actor)
  on conflict(restaurant_id) do update set email=excluded.email,invited_by=excluded.invited_by,created_at=pci_private.clock_now();
  insert into pci_private.admin_events(actor_id,action,detail)values(actor,'owner',jsonb_build_object('restaurantId',p_restaurant,'invited',true));
  return jsonb_build_object('ok',true,'invited',true);
 end if;
 select coalesce(array_agg(user_id),'{}') into previous from public.pci_restaurant_members where restaurant_id=p_restaurant and role='owner' and active and user_id<>new_owner;
 update public.pci_restaurant_members set active=false where restaurant_id=p_restaurant and role='owner' and active and user_id<>new_owner;
 insert into public.pci_restaurant_members(restaurant_id,user_id,role,active)values(p_restaurant,new_owner,'owner',true)
 on conflict(restaurant_id,user_id) do update set role='owner',active=true;
 delete from pci_private.owner_invites where restaurant_id=p_restaurant;
 insert into pci_private.admin_events(actor_id,action,detail)values(actor,'owner',jsonb_build_object('restaurantId',p_restaurant,'ownerId',new_owner,'previous',to_jsonb(previous)));
 return jsonb_build_object('ok',true,'invited',false);
end $$;

-- Called once after a successful sign-in: turns every invite for the signed-in (verified) email into ownership.
create function public.pci_claim_owner_invites() returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); mail text; inv record; claimed integer:=0; previous uuid[];
begin
 if actor is null then return 0;end if;
 select lower(btrim(email)) into mail from auth.users where id=actor and email_confirmed_at is not null;
 if mail is null then return 0;end if;
 for inv in select * from pci_private.owner_invites where email=mail for update loop
  select coalesce(array_agg(user_id),'{}') into previous from public.pci_restaurant_members where restaurant_id=inv.restaurant_id and role='owner' and active and user_id<>actor;
  update public.pci_restaurant_members set active=false where restaurant_id=inv.restaurant_id and role='owner' and active and user_id<>actor;
  insert into public.pci_restaurant_members(restaurant_id,user_id,role,active)values(inv.restaurant_id,actor,'owner',true)
  on conflict(restaurant_id,user_id) do update set role='owner',active=true;
  delete from pci_private.owner_invites where restaurant_id=inv.restaurant_id;
  insert into pci_private.admin_events(actor_id,action,detail)values(actor,'owner',jsonb_build_object('restaurantId',inv.restaurant_id,'ownerId',actor,'previous',to_jsonb(previous),'invite',true));
  claimed:=claimed+1;
 end loop;
 return claimed;
end $$;
revoke all on function public.pci_claim_owner_invites() from public,anon,authenticated,service_role;
grant execute on function public.pci_claim_owner_invites() to authenticated;
commit;
