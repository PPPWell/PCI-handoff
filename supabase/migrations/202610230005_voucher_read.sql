begin;
create function public.pci_read_voucher_capability(p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;now_at timestamptz=pci_private.clock_now();today date=(now_at at time zone 'Europe/Rome')::date;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null;end if;
 select jsonb_build_object(
  'version',1,'language',o.language,'salesMode',o.sales_mode,'serverNow',now_at,'scope',case when c.voucher_id is null then 'order' else 'voucher' end,
  'restaurant',jsonb_build_object('id',r.id,'name',r.name,'placeId',r.place_id),
  'menu',jsonb_build_object('version',m.version,'people',m.people,'translations',(
   select jsonb_object_agg(locale,jsonb_build_object('name',m.translations->locale->'name','summary',m.translations->locale->'summary','conditions',m.translations->locale->'conditions','allergens',m.translations->locale->'allergens','courses',(
    select coalesce(jsonb_agg(jsonb_build_object('name',course->'name','description',course->'description')),'[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(m.translations->locale->'courses')='array' then m.translations->locale->'courses' else '[]'::jsonb end) course
   ))) from unnest(array['zh','it','en']) locale
  )),
  'vouchers',(
   select jsonb_agg(jsonb_build_object('id',v.id,'status',v.status,'expiresOn',v.expires_on,'purchasedAt',v.purchased_at,'extendedOnce',v.extended_once,'redeemedAt',v.redeemed_at,
    'usable',availability.usable,'shortCode',case when availability.usable then v.short_code else null end,'refundStatus',refund.status,
    'withdrawalWindowOpen',availability.usable and v.status='unused' and now_at<=o.withdrawal_deadline and coalesce(refund.status not in ('pending','processing'),true),
    'extensionAvailable',availability.usable and v.status='unused' and not v.extended_once and now_at>o.withdrawal_deadline and coalesce(refund.status not in ('pending','processing'),true)
   ) order by v.id)
   from public.pci_vouchers v
   -- Active provider work outranks historical failed attempts, including a retry of an older request.
   left join lateral(select status from public.pci_refunds where voucher_id=v.id and status in ('pending','processing','failed') order by case status when 'processing' then 0 when 'pending' then 1 else 2 end,requested_at desc,id desc limit 1) refund on true
   cross join lateral(select v.status in ('unused','extended') and v.expires_on>=today and not exists(select 1 from public.pci_refunds where voucher_id=v.id and status='processing') usable) availability
   where v.order_id=o.id and (c.voucher_id is null or v.id=c.voucher_id)
  )
 ) into result
 from pci_private.capabilities c join public.pci_orders o on o.id=c.order_id
 join public.pci_restaurants r on r.id=o.restaurant_id join public.pci_menu_versions m on m.id=o.menu_version_id
 where c.token_hash=p_token_hash and c.revoked_at is null and o.status in ('paid','free-issued','partially-refunded','refunded')
 and exists(select 1 from public.pci_vouchers v where v.order_id=o.id and (c.voucher_id is null or v.id=c.voucher_id));
 return result;
end $$;
revoke all on function public.pci_read_voucher_capability(text) from public,anon,authenticated,service_role;
grant execute on function public.pci_read_voucher_capability(text) to service_role;
commit;
