-- Statistics start at 11 Nov 2026 00:00 Italian time (the 11.11 launch), and accounts on the test list are left out of every report and
-- do not use up places of a limited promotion. Everything stays in the database; only the reports and the promotion count look at the list.
begin;
create table pci_private.stats_settings(id boolean primary key default true check(id),starts_at timestamptz not null);
insert into pci_private.stats_settings(id,starts_at) values(true,timestamptz '2026-11-11 00:00:00+01');
create table pci_private.test_emails(email text primary key check(email=lower(btrim(email)) and length(email)<=254));
alter table pci_private.stats_settings enable row level security;alter table pci_private.test_emails enable row level security;
revoke all on pci_private.stats_settings,pci_private.test_emails from public,anon,authenticated,service_role;

create function pci_private.stats_start() returns timestamptz language sql stable security definer set search_path='' as $$ select starts_at from pci_private.stats_settings $$;
create function pci_private.is_test_user(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join pci_private.test_emails t on t.email=lower(btrim(u.email)) where u.id=p_user)
$$;
revoke all on function pci_private.stats_start(),pci_private.is_test_user(uuid) from public,anon,authenticated,service_role;

-- Test accounts do not use up the places of a limited promotion (a test claim during 11.11 must not eat into the 150).
create or replace function pci_private.promo_issued(promo pci_private.discount_promos) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from pci_private.discount_coupons c where c.campaign_id=any(promo.campaign_ids) and c.issued_at>=promo.starts_at and c.issued_at<promo.ends_at and c.revoked_at is null and not pci_private.is_test_user(c.user_id)
$$;

create or replace function public.pci_discount_report(p_restaurant uuid,p_days integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date;since timestamptz;start_today timestamptz;items jsonb;
begin
 if p_restaurant is null or p_days is null or p_days not between 1 and 90 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 if not pci_private.lock_merchant(p_restaurant) then return jsonb_build_object('ok',false,'code','not_found');end if;
 today:=(pci_private.clock_now() at time zone 'Europe/Rome')::date;
 start_today:=greatest(today::timestamp at time zone 'Europe/Rome',pci_private.stats_start());
 since:=greatest((today-(p_days-1))::timestamp at time zone 'Europe/Rome',pci_private.stats_start());
 with campaigns as(
  select distinct c.campaign_id id from pci_private.discount_coupons c where c.restaurant_id=p_restaurant and c.issued_at>=since and not pci_private.is_test_user(c.user_id)
  union select distinct c.campaign_id from pci_private.discount_redemptions d join pci_private.discount_coupons c on c.id=d.coupon_id where d.restaurant_id=p_restaurant and d.redeemed_at>=since and not pci_private.is_test_user(c.user_id)
 ),uses as(
  select c.campaign_id,d.redeemed_at,((d.redeemed_at at time zone 'Europe/Rome')::time<'15:00') lunch
  from pci_private.discount_redemptions d join pci_private.discount_coupons c on c.id=d.coupon_id
  where d.restaurant_id=p_restaurant and d.undone_at is null and d.redeemed_at>=since and not pci_private.is_test_user(c.user_id)
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'campaignId',k.id,
   'name',(select x.translations->'it'->>'name' from pci_private.discount_campaigns x where x.id=k.id),
   'claimed',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=p_restaurant and c.campaign_id=k.id and c.issued_at>=since and not pci_private.is_test_user(c.user_id)),
   'used',(select count(*) from uses u where u.campaign_id=k.id),
   'usedLunch',(select count(*) from uses u where u.campaign_id=k.id and u.lunch),
   'usedDinner',(select count(*) from uses u where u.campaign_id=k.id and not u.lunch),
   'todayLunch',(select count(*) from uses u where u.campaign_id=k.id and u.lunch and u.redeemed_at>=start_today),
   'todayDinner',(select count(*) from uses u where u.campaign_id=k.id and not u.lunch and u.redeemed_at>=start_today)
  ) order by k.id),'[]'::jsonb) into items from campaigns k;
 return jsonb_build_object('ok',true,'restaurantId',p_restaurant,'date',today,'days',p_days,'menus',items);
end $$;

create or replace function public.pci_platform_report(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date;since timestamptz;start_today timestamptz;restaurants jsonb;users jsonb;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 if p_days is null or p_days not between 1 and 365 then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 today:=(pci_private.clock_now() at time zone 'Europe/Rome')::date;
 start_today:=greatest(today::timestamp at time zone 'Europe/Rome',pci_private.stats_start());
 since:=greatest((today-(p_days-1))::timestamp at time zone 'Europe/Rome',pci_private.stats_start());
 select jsonb_build_object(
   'total',count(*) filter(where u.email_confirmed_at is not null),
   'period',count(*) filter(where u.email_confirmed_at>=since),
   'today',count(*) filter(where u.email_confirmed_at>=start_today)
 ) into users from auth.users u where not exists(select 1 from pci_private.test_emails t where t.email=lower(btrim(u.email)));
 with uses as(
  select d.restaurant_id,d.redeemed_at from pci_private.discount_redemptions d join pci_private.discount_coupons k on k.id=d.coupon_id where d.undone_at is null and d.redeemed_at>=pci_private.stats_start() and not pci_private.is_test_user(k.user_id)
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'restaurantId',r.id,'name',r.name,'status',r.status,
   'claimed',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=r.id and c.issued_at>=pci_private.stats_start() and not pci_private.is_test_user(c.user_id)),
   'used',(select count(*) from uses u where u.restaurant_id=r.id),
   'claimedPeriod',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=r.id and c.issued_at>=pci_private.stats_start() and not pci_private.is_test_user(c.user_id) and c.issued_at>=since),
   'usedPeriod',(select count(*) from uses u where u.restaurant_id=r.id and u.redeemed_at>=since),
   'claimedToday',(select count(*) from pci_private.discount_coupons c where c.restaurant_id=r.id and c.issued_at>=pci_private.stats_start() and not pci_private.is_test_user(c.user_id) and c.issued_at>=start_today),
   'usedToday',(select count(*) from uses u where u.restaurant_id=r.id and u.redeemed_at>=start_today)
  ) order by r.name),'[]'::jsonb) into restaurants from public.pci_restaurants r;
 return jsonb_build_object('ok',true,'date',today,'days',p_days,'users',users,'restaurants',restaurants);
end $$;

create or replace function public.pci_channel_report(p_days integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare days integer:=least(greatest(coalesce(p_days,30),1),365); since timestamptz:=greatest(pci_private.clock_now()-make_interval(days=>days),pci_private.stats_start()); channels jsonb; accepted bigint; rejected bigint;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 select coalesce(jsonb_agg(jsonb_build_object('channel',x.channel,'scans',x.scans,'claimed',x.claimed,'used',x.used) order by x.scans desc,x.claimed desc,x.channel),'[]'::jsonb) into channels from (
  select coalesce(s.channel,c.channel) channel,coalesce(s.scans,0) scans,coalesce(c.claimed,0) claimed,coalesce(c.used,0) used from
   (select nullif(channel,'') channel,count(*) scans from pci_private.go_scans where scanned_at>=since and channel<>'' group by 1) s
   full join
   (select dc.channel,count(*) claimed,count(*) filter(where exists(select 1 from pci_private.discount_redemptions r where r.coupon_id=dc.id and r.undone_at is null)) used
     from pci_private.discount_coupons dc where dc.channel is not null and dc.issued_at>=since and dc.revoked_at is null and not pci_private.is_test_user(dc.user_id) group by 1) c
   on s.channel=c.channel
 ) x;
 select coalesce(sum(n) filter(where choice='accept'),0),coalesce(sum(n) filter(where choice='reject'),0) into accepted,rejected from pci_private.consent_tally where day>=(since at time zone 'Europe/Rome')::date;
 return jsonb_build_object('ok',true,'days',days,'channels',channels,'consent',jsonb_build_object('accept',accepted,'reject',rejected));
end $$;
commit;
