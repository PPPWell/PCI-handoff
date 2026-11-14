begin;
alter table pci_private.restaurant_settings add column pin_revision integer not null default 0 check(pin_revision>=0),add column pin_changed_at timestamptz;
create table pci_private.merchant_devices (
 id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.pci_restaurants(id),user_id uuid not null references auth.users(id),session_id uuid not null,
 label text not null default 'Browser' check(length(label) between 1 and 80),first_seen_at timestamptz not null default pci_private.clock_now(),last_seen_at timestamptz not null default pci_private.clock_now(),revoked_at timestamptz,revoked_by uuid references auth.users(id),
 unique(restaurant_id,user_id,session_id),check((revoked_at is null)=(revoked_by is null))
);
create index on pci_private.merchant_devices(restaurant_id,first_seen_at desc,id desc);
create table pci_private.merchant_security_operations (
 id uuid primary key,restaurant_id uuid not null references public.pci_restaurants(id),user_id uuid not null references auth.users(id),session_id uuid not null,
 kind text not null check(kind in ('pin','revoke','revoke_others')),target_device_id uuid references pci_private.merchant_devices(id),affected_device_ids uuid[] not null default '{}',
 expected_pin_revision integer,pin_revision integer,pin_hash text,completed_at timestamptz not null default pci_private.clock_now(),
 check((kind='pin')=(pin_hash is not null)),check(pin_hash is null or pin_hash ~ '^\$2[aby]\$12\$'),check((kind='revoke')=(target_device_id is not null))
);
alter table pci_private.merchant_devices enable row level security;
alter table pci_private.merchant_security_operations enable row level security;
revoke all on pci_private.merchant_devices,pci_private.merchant_security_operations from public,anon,authenticated,service_role;
create or replace function pci_private.is_merchant(p_restaurant uuid,p_owner_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select pci_private.merchant_session() is not null and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 and exists(select 1 from public.pci_restaurant_members where restaurant_id=p_restaurant and user_id=auth.uid() and active and (not p_owner_only or role='owner'))
 and not exists(select 1 from pci_private.merchant_devices where restaurant_id=p_restaurant and user_id=auth.uid() and session_id=pci_private.merchant_session() and revoked_at is not null)
$$;
create or replace function pci_private.lock_merchant(p_restaurant uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not pci_private.merchant_allowed(p_restaurant) then return false;end if;
 perform id from auth.users where id=auth.uid() and email_confirmed_at is not null for share;if not found then return false;end if;
 if pci_private.is_admin() then perform user_id from pci_private.platform_members where user_id=auth.uid() and role='admin' for share;
 else perform user_id from public.pci_restaurant_members where restaurant_id=p_restaurant and user_id=auth.uid() and active for share;end if;
 if not found then return false;end if;
 insert into pci_private.merchant_devices(restaurant_id,user_id,session_id) values(p_restaurant,auth.uid(),pci_private.merchant_session())
 on conflict(restaurant_id,user_id,session_id) do update set last_seen_at=greatest(merchant_devices.last_seen_at,pci_private.clock_now()) where merchant_devices.revoked_at is null;
 return found;
end $$;
create function pci_private.merchant_owner_allowed(p_restaurant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pci_private.merchant_allowed(p_restaurant) and (pci_private.is_admin() or pci_private.is_merchant(p_restaurant,true))
$$;
create function pci_private.lock_merchant_owner(p_restaurant uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('merchant-owner:'||p_restaurant::text,0));
 if not pci_private.lock_merchant(p_restaurant) then return false;end if;
 -- A separate statement takes a fresh snapshot after waiting on membership locks.
 return pci_private.merchant_owner_allowed(p_restaurant);
end $$;
create function pci_private.merchant_actor_key() returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(auth.uid()::text||':'||pci_private.merchant_session()::text,'sha256'),'hex')
$$;
create function public.pci_register_merchant_device(p_restaurant uuid,p_label text default null,p_replace_label boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_restaurant is null or p_label is not null and (length(btrim(p_label))<1 or length(p_label)>80) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if not pci_private.lock_merchant(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_label is not null then update pci_private.merchant_devices set label=btrim(p_label) where restaurant_id=p_restaurant and user_id=auth.uid() and session_id=pci_private.merchant_session() and (p_replace_label or label='Browser');end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.pci_merchant_owner_context(p_restaurant uuid default null,p_cursor uuid default null,p_label text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare restaurants jsonb;restaurant uuid;devices jsonb;next_cursor uuid;cursor_at timestamptz;settings pci_private.restaurant_settings;
begin
 if auth.uid() is null or pci_private.merchant_session() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then return jsonb_build_object('ok',false,'code','sign_in_required');end if;
 select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name,r.id) into restaurants from public.pci_restaurants r where pci_private.merchant_owner_allowed(r.id);
 if restaurants is null then return jsonb_build_object('ok',false,'code','not_found');end if;
 restaurant=coalesce(p_restaurant,(restaurants->0->>'id')::uuid);if not pci_private.lock_merchant_owner(restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_label is not null and length(btrim(p_label)) between 1 and 80 then update pci_private.merchant_devices set label=btrim(p_label) where restaurant_id=restaurant and user_id=auth.uid() and session_id=pci_private.merchant_session() and label='Browser';end if;
 if p_cursor is not null then select first_seen_at into cursor_at from pci_private.merchant_devices where restaurant_id=restaurant and id=p_cursor;if not found then return jsonb_build_object('ok',false,'code','invalid_request');end if;end if;
 select * into settings from pci_private.restaurant_settings where restaurant_id=restaurant;
 with page as(select d.*,m.role from pci_private.merchant_devices d join public.pci_restaurant_members m on m.restaurant_id=d.restaurant_id and m.user_id=d.user_id where d.restaurant_id=restaurant and not exists(select 1 from pci_private.platform_members p where p.user_id=d.user_id and p.role='admin') and (p_cursor is null or (d.first_seen_at,d.id)<(cursor_at,p_cursor)) order by d.first_seen_at desc,d.id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'role',role,'firstSeenAt',first_seen_at,'lastSeenAt',last_seen_at,'revokedAt',revoked_at,'isCurrent',user_id=auth.uid() and session_id=pci_private.merchant_session()) order by first_seen_at desc,id desc),'[]') into devices from page;
 if jsonb_array_length(devices)>50 then devices=devices-50;next_cursor=(devices->49->>'id')::uuid;end if;
 return jsonb_build_object('ok',true,'serverNow',pci_private.clock_now(),'actorKey',pci_private.merchant_actor_key(),'restaurants',restaurants,'restaurantId',restaurant,'pin',jsonb_build_object('configured',settings.pin_hash is not null,'revision',settings.pin_revision,'changedAt',settings.pin_changed_at,'lockedUntil',settings.pin_locked_until),'devices',devices,'nextCursor',next_cursor);
end $$;
create or replace function public.pci_set_restaurant_pin(p_restaurant uuid,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(pci_private.is_admin() or pci_private.is_merchant(p_restaurant,true)) then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_pin is null or p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','invalid_pin');end if;
 update pci_private.restaurant_settings set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',12)),failed_pin_attempts=0,pin_locked_until=null,pin_revision=pin_revision+1,pin_changed_at=pci_private.clock_now() where restaurant_id=p_restaurant;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 return jsonb_build_object('ok',true);
end $$;
create function pci_private.merchant_security_result(p_id uuid,p_replayed boolean) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'operationId',o.id,'kind',o.kind,'completedAt',o.completed_at,'replayed',p_replayed,'affectedCount',cardinality(o.affected_device_ids),'pinRevision',o.pin_revision,'currentPinRevision',s.pin_revision,'currentPinChangedAt',s.pin_changed_at)
 from pci_private.merchant_security_operations o join pci_private.restaurant_settings s on s.restaurant_id=o.restaurant_id where o.id=p_id
$$;
create function public.pci_read_merchant_security_operation(p_restaurant uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not pci_private.merchant_owner_allowed(p_restaurant) or not exists(select 1 from pci_private.merchant_security_operations where id=p_request and restaurant_id=p_restaurant and user_id=auth.uid() and session_id=pci_private.merchant_session()) then return jsonb_build_object('ok',false,'code','not_found');end if;
 return pci_private.merchant_security_result(p_request,true);
end $$;
create function public.pci_change_merchant_pin(p_restaurant uuid,p_request uuid,p_expected_revision integer,p_current text,p_new text,p_actor_key text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare settings pci_private.restaurant_settings;o pci_private.merchant_security_operations;result jsonb;
begin
 if not pci_private.merchant_owner_allowed(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_actor_key is distinct from pci_private.merchant_actor_key() then return jsonb_build_object('ok',false,'code','session_changed');end if;
 if p_request is null or p_expected_revision is null or p_expected_revision<0 or p_new is null or p_new !~ '^[0-9]{4}$' or p_current is not null and p_current !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if not pci_private.lock_merchant_owner(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 select * into o from pci_private.merchant_security_operations where id=p_request;
 if found then
  if o.restaurant_id<>p_restaurant or o.user_id<>auth.uid() or o.session_id<>pci_private.merchant_session() or o.kind<>'pin' or o.expected_pin_revision<>p_expected_revision or extensions.crypt(p_new,o.pin_hash)<>o.pin_hash then return jsonb_build_object('ok',false,'code','request_conflict');end if;
  return pci_private.merchant_security_result(o.id,true);
 end if;
 select * into settings from pci_private.restaurant_settings where restaurant_id=p_restaurant for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 if settings.pin_revision<>p_expected_revision then return jsonb_build_object('ok',false,'code','state_changed');end if;
 if settings.pin_hash is null then if p_current is not null then return jsonb_build_object('ok',false,'code','invalid_pin');end if;
 else
  result=pci_private.verify_pin(p_restaurant,p_current);if not (result->>'ok')::boolean then
   if result->>'code'='incorrect_pin' and (result->>'attempts_remaining')::integer=0 then return result||jsonb_build_object('code','pin_locked','retry_at',(select pin_locked_until from pci_private.restaurant_settings where restaurant_id=p_restaurant));end if;
   return result;end if;
  if extensions.crypt(p_new,settings.pin_hash)=settings.pin_hash then return jsonb_build_object('ok',false,'code','invalid_pin');end if;
 end if;
 result=public.pci_set_restaurant_pin(p_restaurant,p_new);if not (result->>'ok')::boolean then return result;end if;
 select * into settings from pci_private.restaurant_settings where restaurant_id=p_restaurant;
 insert into pci_private.merchant_security_operations(id,restaurant_id,user_id,session_id,kind,expected_pin_revision,pin_revision,pin_hash) values(p_request,p_restaurant,auth.uid(),pci_private.merchant_session(),'pin',p_expected_revision,settings.pin_revision,settings.pin_hash);
 return pci_private.merchant_security_result(p_request,false);
end $$;
create function public.pci_disconnect_merchant_devices(p_restaurant uuid,p_request uuid,p_device uuid default null,p_actor_key text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o pci_private.merchant_security_operations;target pci_private.merchant_devices;affected uuid[];kind text=case when p_device is null then 'revoke_others' else 'revoke' end;
begin
 if not pci_private.merchant_owner_allowed(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 if p_actor_key is distinct from pci_private.merchant_actor_key() then return jsonb_build_object('ok',false,'code','session_changed');end if;
 if p_request is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if not pci_private.lock_merchant_owner(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));select * into o from pci_private.merchant_security_operations where id=p_request;
 if found then
  if o.restaurant_id<>p_restaurant or o.user_id<>auth.uid() or o.session_id<>pci_private.merchant_session() or o.kind<>kind or o.target_device_id is distinct from p_device then return jsonb_build_object('ok',false,'code','request_conflict');end if;
  return pci_private.merchant_security_result(o.id,true);
 end if;
 if p_device is not null then
  select d.* into target from pci_private.merchant_devices d join public.pci_restaurant_members m on m.restaurant_id=d.restaurant_id and m.user_id=d.user_id where d.id=p_device and d.restaurant_id=p_restaurant and not exists(select 1 from pci_private.platform_members p where p.user_id=d.user_id and p.role='admin');
  if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
  if target.user_id=auth.uid() and target.session_id=pci_private.merchant_session() then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 end if;
 with changed as(update pci_private.merchant_devices d set revoked_at=pci_private.clock_now(),revoked_by=auth.uid() where d.restaurant_id=p_restaurant and d.revoked_at is null and (p_device is null or d.id=p_device) and not(d.user_id=auth.uid() and d.session_id=pci_private.merchant_session()) and exists(select 1 from public.pci_restaurant_members m where m.restaurant_id=d.restaurant_id and m.user_id=d.user_id) and not exists(select 1 from pci_private.platform_members p where p.user_id=d.user_id and p.role='admin') returning d.id)
 select coalesce(array_agg(id),'{}'::uuid[]) into affected from changed;
 insert into pci_private.merchant_security_operations(id,restaurant_id,user_id,session_id,kind,target_device_id,affected_device_ids) values(p_request,p_restaurant,auth.uid(),pci_private.merchant_session(),kind,p_device,affected);
 return pci_private.merchant_security_result(p_request,false);
end $$;
revoke all on function public.pci_set_restaurant_pin(uuid,text),public.pci_register_merchant_device(uuid,text,boolean),public.pci_merchant_owner_context(uuid,uuid,text),public.pci_change_merchant_pin(uuid,uuid,integer,text,text,text),public.pci_disconnect_merchant_devices(uuid,uuid,uuid,text),public.pci_read_merchant_security_operation(uuid,uuid),pci_private.merchant_actor_key(),pci_private.merchant_owner_allowed(uuid),pci_private.lock_merchant_owner(uuid),pci_private.merchant_security_result(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.pci_register_merchant_device(uuid,text,boolean),public.pci_merchant_owner_context(uuid,uuid,text),public.pci_change_merchant_pin(uuid,uuid,integer,text,text,text),public.pci_disconnect_merchant_devices(uuid,uuid,uuid,text),public.pci_read_merchant_security_operation(uuid,uuid) to authenticated;
commit;
