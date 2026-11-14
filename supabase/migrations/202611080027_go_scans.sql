-- One row per poster QR scan: which printed code, which channel, which language the visitor was sent to, and when.
-- No IP, no user agent, no cookie, nothing that identifies a person. Only the server (service role) may write.
begin;
create table if not exists pci_private.go_scans(
 id bigint generated always as identity primary key,
 scanned_at timestamptz not null default now(),
 code text not null check (code ~ '^[a-z0-9-]{1,40}$'),
 channel text not null check (channel ~ '^[a-z0-9-]{1,24}$' or channel=''),
 language text not null check (language in ('zh','it','en')),
 picked text not null check (picked in ('browser','default'))
);
alter table pci_private.go_scans enable row level security;
revoke all on pci_private.go_scans from public,anon,authenticated;
create index if not exists go_scans_code_time on pci_private.go_scans(code,channel,scanned_at);
create or replace function public.pci_record_go_scan(p_code text,p_channel text,p_language text,p_picked text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_code !~ '^[a-z0-9-]{1,40}$' or p_channel !~ '^([a-z0-9-]{1,24})?$' or p_language not in('zh','it','en') or p_picked not in('browser','default') then return;end if;
 insert into pci_private.go_scans(code,channel,language,picked) values(p_code,p_channel,p_language,p_picked);
end $$;
revoke all on function public.pci_record_go_scan(text,text,text,text) from public,anon,authenticated;
grant execute on function public.pci_record_go_scan(text,text,text,text) to service_role;
commit;
