-- One reminder mail per unused coupon, a few days before it expires. Server-side only (service role).
alter table pci_private.discount_coupons add column reminder_sent_at timestamptz;
create index on pci_private.discount_coupons(expires_on) where current_redemption is null and revoked_at is null and reminder_sent_at is null;

create function public.pci_coupons_due_reminder(p_days integer default 7) returns jsonb language sql security definer set search_path='' stable as $$
 select coalesce(jsonb_agg(q.row_data),'[]'::jsonb) from (
  select jsonb_build_object('couponId',c.id,'email',u.email,'language',c.language,'expiresOn',c.expires_on,'restaurant',r.name,'couponName',c.translations->c.language->>'name','discountCents',c.discount_cents) row_data
  from pci_private.discount_coupons c join auth.users u on u.id=c.user_id join public.pci_restaurants r on r.id=c.restaurant_id
  where c.current_redemption is null and c.revoked_at is null and c.reminder_sent_at is null and u.email is not null and u.email_confirmed_at is not null
   and c.expires_on>=(pci_private.clock_now() at time zone 'Europe/Rome')::date
   and c.expires_on<=(pci_private.clock_now() at time zone 'Europe/Rome')::date+least(greatest(p_days,0),30)
  order by c.expires_on,c.id limit 200) q
$$;

create function public.pci_mark_coupon_reminded(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare done boolean;
begin
 update pci_private.discount_coupons set reminder_sent_at=pci_private.clock_now() where id=p_id and reminder_sent_at is null returning true into done;
 return coalesce(done,false);
end $$;

revoke all on function public.pci_coupons_due_reminder(integer),public.pci_mark_coupon_reminded(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pci_coupons_due_reminder(integer),public.pci_mark_coupon_reminded(uuid) to service_role;
