-- Poster channel on a coupon, and an anonymous tally of cookie-banner choices.
--  * A visitor who arrives through a printed QR code (/go/{code}/{channel}/) carries the channel label to the claim page; right after a
--    claim the server notes it on the coupon, so claims and uses can be counted per poster. Only the label (p1, window, flyer-may) is
--    stored, never anything about the visitor, and only for the coupon's own owner, within minutes of the claim.
--  * The banner choice (accept / reject) is counted per day with no identifier, so the consent rate can be computed even though a
--    refusal may not be sent to the analytics tool.
begin;
alter table pci_private.discount_coupons add column channel text check(channel ~ '^[a-z0-9-]{1,24}$');
create index discount_coupons_channel on pci_private.discount_coupons(channel) where channel is not null;

create function public.pci_note_coupon_channel(p_coupon uuid,p_channel text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_coupon is null or p_channel is null or p_channel !~ '^[a-z0-9-]{1,24}$' then return;end if;
 update pci_private.discount_coupons set channel=p_channel where id=p_coupon and user_id=auth.uid() and channel is null and issued_at>pci_private.clock_now()-interval '10 minutes';
end $$;
revoke all on function public.pci_note_coupon_channel(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_note_coupon_channel(uuid,text) to authenticated;

create table pci_private.consent_tally(
 day date not null,
 choice text not null check(choice in('accept','reject')),
 n integer not null default 0 check(n>=0),
 primary key(day,choice)
);
alter table pci_private.consent_tally enable row level security;
revoke all on pci_private.consent_tally from public,anon,authenticated,service_role;
create function public.pci_record_consent(p_choice text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_choice is null or p_choice not in('accept','reject') then return;end if;
 insert into pci_private.consent_tally(day,choice,n) values((pci_private.clock_now() at time zone 'Europe/Rome')::date,p_choice,1)
 on conflict(day,choice) do update set n=pci_private.consent_tally.n+1;
end $$;
revoke all on function public.pci_record_consent(text) from public,anon,authenticated;
grant execute on function public.pci_record_consent(text) to service_role;

-- Admin report: per poster channel, scans (go_scans), claims and uses (coupons), plus banner choices, for the last N days.
create function public.pci_channel_report(p_days integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare days integer:=least(greatest(coalesce(p_days,30),1),365); since timestamptz:=pci_private.clock_now()-make_interval(days=>days); channels jsonb; accepted bigint; rejected bigint;
begin
 if auth.uid() is null or not pci_private.is_admin() then return jsonb_build_object('ok',false,'code','forbidden');end if;
 select coalesce(jsonb_agg(jsonb_build_object('channel',x.channel,'scans',x.scans,'claimed',x.claimed,'used',x.used) order by x.scans desc,x.claimed desc,x.channel),'[]'::jsonb) into channels from (
  select coalesce(s.channel,c.channel) channel,coalesce(s.scans,0) scans,coalesce(c.claimed,0) claimed,coalesce(c.used,0) used from
   (select nullif(channel,'') channel,count(*) scans from pci_private.go_scans where scanned_at>=since and channel<>'' group by 1) s
   full join
   (select dc.channel,count(*) claimed,count(*) filter(where exists(select 1 from pci_private.discount_redemptions r where r.coupon_id=dc.id and r.undone_at is null)) used
     from pci_private.discount_coupons dc where dc.channel is not null and dc.issued_at>=since and dc.revoked_at is null group by 1) c
   on s.channel=c.channel
 ) x;
 select coalesce(sum(n) filter(where choice='accept'),0),coalesce(sum(n) filter(where choice='reject'),0) into accepted,rejected from pci_private.consent_tally where day>=(since at time zone 'Europe/Rome')::date;
 return jsonb_build_object('ok',true,'days',days,'channels',channels,'consent',jsonb_build_object('accept',accepted,'reject',rejected));
end $$;
revoke all on function public.pci_channel_report(integer) from public,anon,authenticated,service_role;
grant execute on function public.pci_channel_report(integer) to authenticated;
commit;
