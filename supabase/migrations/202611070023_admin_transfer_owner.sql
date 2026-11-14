-- Hand a restaurant to its real owner: the platform admin names the new owner's email (signed in once), the previous
-- owner loses access at once, staff stay. Used when a restaurant goes live after being set up with a test account.
begin;
alter table pci_private.admin_events drop constraint admin_events_action_check;
alter table pci_private.admin_events add constraint admin_events_action_check check(action in('setup-campaign','campaign-status','staff','owner'));

create function public.pci_admin_transfer_owner(p_restaurant uuid,p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); new_owner uuid; owner_email text:=lower(btrim(coalesce(p_email,''))); previous uuid[];
begin
 if actor is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_restaurant is null then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if owner_email!~'^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(owner_email)>254 then return jsonb_build_object('ok',false,'code','invalid_email');end if;
 perform 1 from public.pci_restaurants where id=p_restaurant for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found');end if;
 select u.id into new_owner from auth.users u where lower(btrim(u.email))=owner_email and u.email_confirmed_at is not null;
 if new_owner is null then return jsonb_build_object('ok',false,'code','owner_not_verified');end if;
 select coalesce(array_agg(user_id),'{}') into previous from public.pci_restaurant_members where restaurant_id=p_restaurant and role='owner' and active and user_id<>new_owner;
 -- Previous owners are switched off, not deleted: their past redemptions keep pointing at a real member.
 update public.pci_restaurant_members set active=false where restaurant_id=p_restaurant and role='owner' and active and user_id<>new_owner;
 insert into public.pci_restaurant_members(restaurant_id,user_id,role,active)values(p_restaurant,new_owner,'owner',true)
 on conflict(restaurant_id,user_id) do update set role='owner',active=true;
 insert into pci_private.admin_events(actor_id,action,detail)values(actor,'owner',jsonb_build_object('restaurantId',p_restaurant,'ownerId',new_owner,'previous',to_jsonb(previous)));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.pci_admin_transfer_owner(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_admin_transfer_owner(uuid,text) to authenticated;
commit;
