-- Subscribing is one step: type an email, tick nothing else. No confirmation email.
begin;
create function public.pci_subscribe_email(p_email text,p_language text,p_source text) returns jsonb language plpgsql security definer set search_path='' as $$
declare address text:=lower(btrim(p_email));s public.pci_subscribers;recent integer;
begin
 if address is null or length(address)>254 or address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_language is null or p_language not in('zh','it','en') or p_source is null or p_source not in('home','subscribe-page','login') then return jsonb_build_object('ok',false,'code','invalid_request');end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription-email:'||address,0));
 select count(*) into recent from public.pci_consent_records where type='marketing' and source in('home','subscribe-page','login') and user_id is null and created_at>pci_private.clock_now()-interval '1 hour';
 if recent>=300 then return jsonb_build_object('ok',false,'code','rate_limited');end if;
 select * into s from public.pci_subscribers where email=address for update;
 if found and s.status='confirmed' then return jsonb_build_object('ok',true,'subscribed',true,'replayed',true);end if;
 insert into public.pci_subscribers(email,language,status,confirmed_at,unsubscribed_at,revision) values(address,p_language,'confirmed',pci_private.clock_now(),null,1)
 on conflict(email) do update set language=excluded.language,status='confirmed',confirmed_at=pci_private.clock_now(),unsubscribed_at=null,revision=public.pci_subscribers.revision+1;
 insert into public.pci_consent_records(email,type,opted_in,language,policy_version,source) values(address,'marketing',true,p_language,'newsletter-v1',p_source);
 return jsonb_build_object('ok',true,'subscribed',true,'replayed',false);
end $$;
revoke all on function public.pci_subscribe_email(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.pci_subscribe_email(text,text,text) to anon,authenticated;
commit;
