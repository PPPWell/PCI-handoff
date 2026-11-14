-- Daily coupon report straight from the database (no browser tracking): per menu, how many coupons were claimed and used,
-- split into lunch and dinner by the Rome time of the redemption (before 15:00 = lunch). Undone redemptions do not count as used.
begin;
create index if not exists discount_coupons_restaurant_issued on pci_private.discount_coupons(restaurant_id,issued_at);
create function public.pci_discount_report(p_restaurant uuid,p_days integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date;since timestamptz;start_today timestamptz;items jsonb;
begin
 if p_restaurant is null or p_days is null or p_days not between 1 and 90 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if not pci_private.lock_merchant(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 today:=(pci_private.clock_now() at time zone 'Europe/Rome')::date;
 start_today:=today::timestamp at time zone 'Europe/Rome';
 since:=(today-(p_days-1))::timestamp at time zone 'Europe/Rome';
 with campaigns as(
  select distinct c.campaign_id id from pci_private.discount_coupons c where c.restaurant_id=p_restaurant and c.issued_at>=since
  union select distinct c.campaign_id from pci_private.discount_redemptions d join pci_private.discount_coupons c on c.id=d.coupon_id where d.restaurant_id=p_restaurant and d.redeemed_at>=since
 ),uses as(
  select c.campaign_id,d.redeemed_at,((d.redeemed_at at time zone 'Europe/Rome')::time<'15:00') lunch
  from pci_private.discount_redemptions d join pci_private.discount_coupons c on c.id=d.coupon_id
  where d.restaurant_id=p_restaurant and d.undone_at is null and d.redeemed_at>=since
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'campaignId',k.id,
   'name',(select x.translations->'it'->>'name' from pci_private.discount_campaigns x where x.id=k.id),
   'claimed',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=p_restaurant and c.campaign_id=k.id and c.issued_at>=since),
   'used',(select count(*) from uses u where u.campaign_id=k.id),
   'usedLunch',(select count(*) from uses u where u.campaign_id=k.id and u.lunch),
   'usedDinner',(select count(*) from uses u where u.campaign_id=k.id and not u.lunch),
   'todayLunch',(select count(*) from uses u where u.campaign_id=k.id and u.lunch and u.redeemed_at>=start_today),
   'todayDinner',(select count(*) from uses u where u.campaign_id=k.id and not u.lunch and u.redeemed_at>=start_today)
  ) order by k.id),'[]'::jsonb) into items from campaigns k;
 return jsonb_build_object('ok',true,'restaurantId',p_restaurant,'date',today,'days',p_days,'menus',items);
end $$;
revoke all on function public.pci_discount_report(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.pci_discount_report(uuid,integer) to authenticated;
commit;
