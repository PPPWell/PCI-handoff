begin;
create index on pci_private.discount_redemptions(restaurant_id,redeemed_at desc,id desc);
create index on pci_private.discount_redemptions(restaurant_id,undone_at) where undone_at is not null;
create function public.pci_discount_today(p_restaurant uuid,p_before_time timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date;start_at timestamptz;end_at timestamptz;items jsonb;cursor_data jsonb;
begin
 if p_restaurant is null or (p_before_time is null)<>(p_before_id is null) or p_before_time is not null and not pg_catalog.isfinite(p_before_time) then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if not pci_private.lock_merchant(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 today:=(pci_private.clock_now() at time zone 'Europe/Rome')::date;start_at:=today::timestamp at time zone 'Europe/Rome';end_at:=(today+1)::timestamp at time zone 'Europe/Rome';
 with page as(select d.id,d.coupon_id,d.redeemed_at,d.undone_at,c.short_code,c.discount_cents,c.translations->'it'->>'name' name
 from pci_private.discount_redemptions d join pci_private.discount_coupons c on c.id=d.coupon_id
 where d.restaurant_id=p_restaurant and ((d.redeemed_at>=start_at and d.redeemed_at<end_at)or(d.undone_at>=start_at and d.undone_at<end_at)) and(p_before_time is null or(d.redeemed_at,d.id)<(p_before_time,p_before_id))order by d.redeemed_at desc,d.id desc limit 51),visible as(select * from page order by redeemed_at desc,id desc limit 50)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'couponId',coupon_id,'name',name,'discountCents',discount_cents,'shortCode',short_code,'redeemedAt',redeemed_at,'undoneAt',undone_at)order by redeemed_at desc,id desc)from visible),'[]'::jsonb),case when(select count(*)from page)>50 then(select jsonb_build_object('at',redeemed_at,'id',id)from visible order by redeemed_at,id limit 1)else null end into items,cursor_data;
 return jsonb_build_object('ok',true,'restaurantId',p_restaurant,'date',today,'records',items,'nextCursor',cursor_data);
end $$;
revoke all on function public.pci_discount_today(uuid,timestamptz,uuid)from public,anon,authenticated,service_role;
grant execute on function public.pci_discount_today(uuid,timestamptz,uuid)to authenticated;
commit;
