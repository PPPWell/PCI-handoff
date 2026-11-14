begin;
create schema if not exists pci_private;
revoke all on schema pci_private from public, anon, authenticated, service_role;
create function pci_private.clock_now() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp() $$;
revoke all on function pci_private.clock_now() from public,anon,authenticated,service_role;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.pci_voucher_status as enum ('unused','extended','redeemed','withdrawn','refunded','expired');
create type public.pci_redemption_method as enum ('scan','short_code','offline','pin');

create table public.pci_restaurants (
 id uuid primary key default gen_random_uuid(), place_id text not null unique,
 name text not null check(length(btrim(name))>0), sales_mode text not null check(sales_mode in ('prepaid','pay-at-restaurant')),
 status text not null default 'preparing' check(status in ('preparing','active','paused','closed')),
 created_at timestamptz not null default pci_private.clock_now()
);
create table pci_private.restaurant_settings (
 restaurant_id uuid primary key references public.pci_restaurants(id), stripe_account_id text unique,
 pin_hash text check(pin_hash ~ '^\$2[aby]\$12\$'), failed_pin_attempts integer not null default 0 check(failed_pin_attempts between 0 and 5), pin_locked_until timestamptz,
 commission_bps integer not null check(commission_bps between 0 and 10000), commission_vat_bps integer not null check(commission_vat_bps between 0 and 10000),
 trial_start date, trial_end date, contact_email text, contact_phone text,
 check((trial_start is null)=(trial_end is null)), check(trial_end>=trial_start)
);
create table pci_private.platform_members (user_id uuid primary key references auth.users(id), role text not null check(role in ('admin','verifier')));
create table public.pci_restaurant_members (
 restaurant_id uuid references public.pci_restaurants(id), user_id uuid references auth.users(id), role text not null check(role in ('owner','staff')), active boolean not null default true,
 primary key(restaurant_id,user_id)
);
create table public.pci_menus (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.pci_restaurants(id), content_offer_id text not null unique,
 unique(id,restaurant_id)
);
create table public.pci_menu_versions (
 id uuid primary key default gen_random_uuid(), menu_id uuid not null, restaurant_id uuid not null, version integer not null check(version>0),
 translations jsonb not null check(jsonb_typeof(translations)='object' and translations ?& array['zh','it','en']),
 people integer not null check(people>0), price_cents integer not null check(price_cents>0), currency text not null default 'EUR' check(currency='EUR'),
 validity_months integer not null default 6 check(validity_months=6), sales_mode text not null check(sales_mode in ('prepaid','pay-at-restaurant')),
 created_at timestamptz not null default pci_private.clock_now(),
 foreign key(menu_id,restaurant_id) references public.pci_menus(id,restaurant_id), unique(menu_id,version),unique(id,restaurant_id)
);
create table public.pci_orders (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, menu_version_id uuid not null,
 purchaser_id uuid references auth.users(id), language text not null check(language in ('zh','it','en')),
 quantity integer not null check(quantity between 1 and 6), unit_amount_cents integer not null check(unit_amount_cents>=0),
 unit_commission_cents integer not null check(unit_commission_cents>=0), unit_commission_vat_cents integer not null check(unit_commission_vat_cents>=0),
 total_amount_cents bigint generated always as (quantity::bigint*unit_amount_cents) stored,
 commission_cents bigint generated always as (quantity::bigint*unit_commission_cents) stored,
 commission_vat_cents bigint generated always as (quantity::bigint*unit_commission_vat_cents) stored,
 currency text not null default 'EUR' check(currency='EUR'), sales_mode text not null check(sales_mode in ('prepaid','pay-at-restaurant')),
 status text not null default 'pending' check(status in ('pending','paid','free-issued','failed','cancelled','partially-refunded','refunded')),
 stripe_payment_intent_id text unique, stripe_checkout_session_id text unique,
 source text, referral_code text, discount_code text,
 created_at timestamptz not null default pci_private.clock_now(), purchased_at timestamptz, withdrawal_deadline timestamptz,
 foreign key(menu_version_id,restaurant_id) references public.pci_menu_versions(id,restaurant_id),
 unique(id,restaurant_id,menu_version_id),unique(id,restaurant_id),
 check(unit_commission_cents::bigint+unit_commission_vat_cents<=unit_amount_cents),
 check((purchased_at is null)=(withdrawal_deadline is null)),check(withdrawal_deadline>purchased_at),
 check(status not in ('paid','free-issued','partially-refunded','refunded') or purchased_at is not null),
 check(sales_mode<>'pay-at-restaurant' or unit_amount_cents=0)
);
create table pci_private.order_contacts (
 order_id uuid primary key references public.pci_orders(id), email text not null check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
create index on pci_private.order_contacts(email);
create index on public.pci_orders(purchaser_id);
create index on public.pci_orders(restaurant_id,purchased_at);
create table public.pci_vouchers (
 id uuid primary key default gen_random_uuid(), order_id uuid not null, restaurant_id uuid not null, menu_version_id uuid not null,
 short_code text not null unique check(short_code ~ '^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
 status public.pci_voucher_status not null default 'unused', purchased_at timestamptz not null, expires_on date not null,
 extended_once boolean not null default false, extended_at timestamptz, redeemed_at timestamptz, redeemed_method public.pci_redemption_method, current_redemption_id uuid,
 foreign key(order_id,restaurant_id,menu_version_id) references public.pci_orders(id,restaurant_id,menu_version_id),
 unique(id,order_id,restaurant_id), unique(id,restaurant_id),
 check(extended_once=(extended_at is not null)),check(status<>'extended' or extended_once),check(status<>'unused' or not extended_once),
 check((status='redeemed')=(redeemed_at is not null)),check((status='redeemed')=(redeemed_method is not null)),check((status='redeemed')=(current_redemption_id is not null))
);
create index on public.pci_vouchers(order_id);
create index on public.pci_vouchers(restaurant_id,status);
create index on public.pci_vouchers(expires_on) where status in ('unused','extended');
create table pci_private.capabilities (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.pci_orders(id), voucher_id uuid references public.pci_vouchers(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), encrypted_token text not null check(length(encrypted_token)>40),
 created_at timestamptz not null default pci_private.clock_now(), revoked_at timestamptz
);
create table public.pci_redemptions (
 id uuid primary key default gen_random_uuid(), voucher_id uuid not null, restaurant_id uuid not null, actor_id uuid references auth.users(id),
 method public.pci_redemption_method not null, redeemed_at timestamptz not null default pci_private.clock_now(), previous_status public.pci_voucher_status not null check(previous_status in ('unused','extended')),
 voided_at timestamptz, voided_by uuid references auth.users(id), voided_method public.pci_redemption_method,
 foreign key(voucher_id,restaurant_id) references public.pci_vouchers(id,restaurant_id),
 check((voided_at is null)=(voided_method is null))
);
create unique index pci_one_active_redemption on public.pci_redemptions(voucher_id) where voided_at is null;
alter table public.pci_vouchers add constraint pci_current_redemption_fk foreign key(current_redemption_id) references public.pci_redemptions(id);
create index on public.pci_redemptions(restaurant_id,redeemed_at);
create table public.pci_voucher_events (
 id bigint generated always as identity primary key, voucher_id uuid not null references public.pci_vouchers(id),
 from_status public.pci_voucher_status, to_status public.pci_voucher_status not null, actor_id uuid references auth.users(id), actor_kind text not null,
 method text not null, occurred_at timestamptz not null default pci_private.clock_now(), note text check(length(note)<=1000)
);
create index on public.pci_voucher_events(voucher_id,occurred_at);
create table public.pci_refunds (
 id uuid primary key default gen_random_uuid(), voucher_id uuid not null, order_id uuid not null, restaurant_id uuid not null,
 type text not null check(type in ('withdrawal','merchant-default')), status text not null default 'pending' check(status in ('pending','processing','succeeded','cancelled','failed')),
 requested_by uuid references auth.users(id), requested_at timestamptz not null default pci_private.clock_now(), available_after timestamptz not null,
 started_at timestamptz, completed_at timestamptz, amount_cents integer not null check(amount_cents>=0),
 commission_refund_cents integer not null check(commission_refund_cents>=0), commission_vat_refund_cents integer not null check(commission_vat_refund_cents>=0),
 stripe_refund_id text unique, receipt_sent_at timestamptz, reason_code text,
 foreign key(voucher_id,order_id,restaurant_id) references public.pci_vouchers(id,order_id,restaurant_id),
 check(commission_refund_cents::bigint+commission_vat_refund_cents<=amount_cents),check(available_after>=requested_at),
 check(status<>'succeeded' or completed_at is not null)
);
create unique index pci_one_open_refund on public.pci_refunds(voucher_id) where status in ('pending','processing');
create table pci_private.management_grants (
 id uuid primary key default gen_random_uuid(), voucher_id uuid not null references public.pci_vouchers(id), purchaser_id uuid not null references auth.users(id),
 purpose text not null check(purpose in ('withdrawal','extension')), expires_at timestamptz not null default pci_private.clock_now()+interval '10 minutes', used_at timestamptz,
 created_at timestamptz not null default pci_private.clock_now()
);
create table public.pci_consent_records (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), email text, reference_id uuid not null default gen_random_uuid(),
 type text not null check(type in ('marketing','cookie-analytics')), opted_in boolean not null, language text not null check(language in ('zh','it','en')),
 policy_version text not null check(length(btrim(policy_version))>0), source text not null, created_at timestamptz not null default pci_private.clock_now(), revoked_at timestamptz,
 check(email is null or email=lower(btrim(email))),check(type<>'marketing' or email is not null)
);
create table public.pci_subscribers (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), email text not null unique check(email=lower(btrim(email))),
 language text not null check(language in ('zh','it','en')), status text not null default 'pending' check(status in ('pending','confirmed','unsubscribed')),
 created_at timestamptz not null default pci_private.clock_now(), confirmed_at timestamptz, unsubscribed_at timestamptz,
 check(status<>'confirmed' or confirmed_at is not null),check(status<>'unsubscribed' or unsubscribed_at is not null)
);
create table pci_private.notification_queue (
 id uuid primary key default gen_random_uuid(), voucher_id uuid references public.pci_vouchers(id), order_id uuid references public.pci_orders(id),
 kind text not null, dedup_key text not null unique, language text not null check(language in ('zh','it','en')), payload jsonb not null default '{}',
 due_at timestamptz not null default pci_private.clock_now(), status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 attempts integer not null default 0 check(attempts>=0), created_at timestamptz not null default pci_private.clock_now(), sent_at timestamptz
);

-- These helpers only answer questions about the current authenticated subject.
create function pci_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pci_private.platform_members where user_id=auth.uid() and role='admin')
$$;
create function pci_private.is_verifier() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pci_private.platform_members where user_id=auth.uid() and role='verifier')
$$;
create function pci_private.is_merchant(p_restaurant uuid,p_owner_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pci_restaurant_members where restaurant_id=p_restaurant and user_id=auth.uid() and active and (not p_owner_only or role='owner'))
$$;
create function pci_private.is_purchaser(p_order uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pci_orders where id=p_order and purchaser_id=auth.uid())
$$;
revoke all on all functions in schema pci_private from public,anon,authenticated,service_role;
grant usage on schema pci_private to authenticated;
grant execute on function pci_private.is_admin(),pci_private.is_verifier(),pci_private.is_merchant(uuid,boolean),pci_private.is_purchaser(uuid) to authenticated;

alter table public.pci_restaurants enable row level security;
alter table public.pci_restaurant_members enable row level security;
alter table public.pci_menus enable row level security;
alter table public.pci_menu_versions enable row level security;
alter table public.pci_orders enable row level security;
alter table public.pci_vouchers enable row level security;
alter table public.pci_redemptions enable row level security;
alter table public.pci_voucher_events enable row level security;
alter table public.pci_refunds enable row level security;
alter table public.pci_consent_records enable row level security;
alter table public.pci_subscribers enable row level security;
create policy pci_restaurants_read on public.pci_restaurants for select to authenticated using(pci_private.is_admin() or pci_private.is_verifier() or pci_private.is_merchant(id));
create policy pci_members_read on public.pci_restaurant_members for select to authenticated using(pci_private.is_admin() or user_id=auth.uid() or pci_private.is_merchant(restaurant_id,true));
create policy pci_menus_read on public.pci_menus for select to authenticated using(pci_private.is_admin() or pci_private.is_merchant(restaurant_id,true));
create policy pci_versions_read on public.pci_menu_versions for select to authenticated using(pci_private.is_admin() or pci_private.is_merchant(restaurant_id,true) or exists(select 1 from public.pci_orders o where o.menu_version_id=pci_menu_versions.id and o.purchaser_id=auth.uid()));
create policy pci_orders_read on public.pci_orders for select to authenticated using(pci_private.is_admin() or purchaser_id=auth.uid() or pci_private.is_merchant(restaurant_id,true));
create policy pci_vouchers_read on public.pci_vouchers for select to authenticated using(pci_private.is_admin() or pci_private.is_merchant(restaurant_id,true) or pci_private.is_purchaser(order_id));
create policy pci_redemptions_read on public.pci_redemptions for select to authenticated using(pci_private.is_admin() or pci_private.is_merchant(restaurant_id,true) or (actor_id=auth.uid() and pci_private.is_merchant(restaurant_id)) or exists(select 1 from public.pci_vouchers v where v.id=voucher_id and pci_private.is_purchaser(v.order_id)));
create policy pci_events_read on public.pci_voucher_events for select to authenticated using(pci_private.is_admin() or exists(select 1 from public.pci_vouchers v where v.id=voucher_id and (pci_private.is_merchant(v.restaurant_id,true) or pci_private.is_purchaser(v.order_id))));
create policy pci_refunds_read on public.pci_refunds for select to authenticated using(pci_private.is_admin() or pci_private.is_merchant(restaurant_id,true) or pci_private.is_purchaser(order_id));
create policy pci_consent_read on public.pci_consent_records for select to authenticated using(pci_private.is_admin() or user_id=auth.uid());
create policy pci_subscribers_read on public.pci_subscribers for select to authenticated using(pci_private.is_admin() or user_id=auth.uid());

create function pci_private.reject_version_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Menu versions are immutable; create a new version' using errcode='23514'; end
$$;
revoke all on function pci_private.reject_version_mutation() from public,anon,authenticated,service_role;
create trigger pci_immutable_version before update or delete on public.pci_menu_versions for each row execute function pci_private.reject_version_mutation();

-- Explicit grants avoid relying on project-specific Supabase default privileges.
revoke all on public.pci_restaurants,public.pci_restaurant_members,public.pci_menus,public.pci_menu_versions,public.pci_orders,public.pci_vouchers,public.pci_redemptions,public.pci_voucher_events,public.pci_refunds,public.pci_consent_records,public.pci_subscribers from public,anon,authenticated,service_role;
grant select on public.pci_restaurants,public.pci_restaurant_members,public.pci_menus,public.pci_menu_versions,public.pci_orders,public.pci_vouchers,public.pci_redemptions,public.pci_voucher_events,public.pci_refunds,public.pci_consent_records,public.pci_subscribers to authenticated,service_role;
alter table pci_private.restaurant_settings enable row level security;
alter table pci_private.platform_members enable row level security;
alter table pci_private.order_contacts enable row level security;
alter table pci_private.capabilities enable row level security;
alter table pci_private.management_grants enable row level security;
alter table pci_private.notification_queue enable row level security;
revoke all on all tables in schema pci_private from public,anon,authenticated,service_role;
commit;
