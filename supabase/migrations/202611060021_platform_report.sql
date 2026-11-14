-- Platform report for the operator (platform admin only): sign-ups, and per restaurant how many coupons were claimed and used,
-- all time, in the last p_days days and today (Rome time). Counts come from the database, never from browser tracking.
-- Undone redemptions do not count as used. Add yourself once with:
--   insert into pci_private.platform_members(user_id,role) select id,'admin' from auth.users where email='admin@example.com' and email_confirmed_at is not null;
begin;
create function public.pci_am_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and pci_private.is_admin()
$$;
revoke all on function public.pci_am_platform_admin() from public,anon,authenticated,service_role;
grant execute on function public.pci_am_platform_admin() to authenticated;

create function public.pci_platform_report(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 ) into users from auth.users u;
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
revoke all on function public.pci_platform_report(integer) from public,anon,authenticated,service_role;
grant execute on function public.pci_platform_report(integer) to authenticated;
commit;
