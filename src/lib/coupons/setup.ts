import type {Catalog} from '../catalog/types';
import {couponTranslations} from './ux';
import {validatedAuthConfig} from '../auth/client';
import {voucherKeyring} from '../auth/account';

/** Local operator tool only: generates reviewable SQL, never connects or grants roles over HTTP. */
export function couponSetupSql(catalog:Catalog,ownerEmail:string):string {
 if(ownerEmail!==ownerEmail.trim()||! /^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(ownerEmail)||ownerEmail.length>254)throw Error('Explicit owner email required');
 // One campaign per menu, all for the same restaurant.
 const offers=catalog.offers.filter(o=>o.benefit&&o.placeId==='restaurant-1');
 const place=catalog.places.find(p=>p.id==='restaurant-1');
 if(!offers.length||!place||offers.some(o=>o.status!=='on-sale'||o.salesMode!=='pay-at-restaurant'||o.benefit?.discountCents!==800||o.benefit.scope!=='partner-menu'))throw Error('Unexpected pilot content');
 const blocks=offers.map(offer=>{
  const benefit=offer.benefit!;
  // The menu name and meal window are frozen on each coupon so staff see them without the website's content files.
  const payload={ownerEmail:ownerEmail.toLowerCase(),placeId:place.id,name:place.translations.it.name,campaignId:benefit.campaignId,version:offer.version,discountCents:benefit.discountCents,...(offer.validityDays?{validityDays:offer.validityDays}:{validityMonths:offer.validityMonths}),translations:couponTranslations(offer)};
  // Hex encoding prevents quote/backslash/dollar delimiter injection in this generated SQL.
  const hex=Buffer.from(JSON.stringify(payload),'utf8').toString('hex');
  return `do $pci_setup$
declare d jsonb:=convert_from(decode('${hex}','hex'),'UTF8')::jsonb; owner_id uuid; r public.pci_restaurants; c pci_private.discount_campaigns;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coupon-setup:'||(d->>'campaignId'),0));
 select id into owner_id from auth.users where lower(btrim(email))=d->>'ownerEmail' and email_confirmed_at is not null;
 if owner_id is null then raise exception 'Verified owner required';end if;
 select * into r from public.pci_restaurants where place_id=d->>'placeId' for update;
 if not found then
  insert into public.pci_restaurants(place_id,name,sales_mode,status)values(d->>'placeId',d->>'name','pay-at-restaurant','active')returning * into r;
 elsif r.name<>d->>'name' or r.sales_mode<>'pay-at-restaurant' or r.status<>'active' then raise exception 'Restaurant differs; review existing configuration';end if;
 if exists(select 1 from public.pci_restaurant_members where restaurant_id=r.id and (user_id=owner_id and (role<>'owner' or not active) or user_id<>owner_id and role='owner' and active))then raise exception 'Owner membership differs; review existing configuration';end if;
 insert into public.pci_restaurant_members(restaurant_id,user_id,role)values(r.id,owner_id,'owner')on conflict do nothing;
 -- Required for device/PIN management only. Preserve every existing financial setting.
 insert into pci_private.restaurant_settings(restaurant_id,commission_bps,commission_vat_bps)values(r.id,0,0)on conflict do nothing;
 select * into c from pci_private.discount_campaigns where id=d->>'campaignId' for update;
 if not found then
  insert into pci_private.discount_campaigns(id,restaurant_id,version,discount_cents,scope,validity_months,validity_days,translations,status)values(d->>'campaignId',r.id,(d->>'version')::integer,(d->>'discountCents')::integer,'partner-menu',(d->>'validityMonths')::integer,(d->>'validityDays')::integer,d->'translations','active');
 elsif c.restaurant_id<>r.id or c.version<>(d->>'version')::integer or c.discount_cents<>(d->>'discountCents')::integer or c.scope<>'partner-menu' or c.validity_months is distinct from (d->>'validityMonths')::integer or c.validity_days is distinct from (d->>'validityDays')::integer or c.translations<>d->'translations' or c.status<>'active' then raise exception 'Campaign differs; review existing configuration';end if;
end $pci_setup$;`;
 });
 return `-- Generated from the current PaStation content (${offers.length} coupon campaigns: ${offers.map(o=>o.benefit!.campaignId).join(', ')}). Review and run as database administrator.\n-- Coupon-only settings below do not define a commission agreement or create paid menus.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='15s';\n${blocks.join('\n')}\ncommit;\n`;
}

export function couponConfiguration(env:Record<string,string|undefined>) {
 const issues:string[]=[];
 if(!validatedAuthConfig({url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,secretKey:env.SUPABASE_SECRET_KEY,siteOrigin:env.SITE_ORIGIN,emailEnabled:true})){
  for(const name of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SITE_ORIGIN'])issues.push(name);
 }
 if(env.AUTH_EMAIL_ENABLED==='false')issues.push('AUTH_EMAIL_ENABLED');
 const id=env.VOUCHER_ENCRYPTION_KEY_ID??'primary';
 if(!voucherKeyring(env)[id])issues.push('VOUCHER_ENCRYPTION_KEY');
 return {ready:issues.length===0,issues,manualChecks:['Supabase migrations 01–16 applied','Email confirmation enabled; six-digit OTP expires after 600 seconds','Custom SMTP and verified sender domain tested with a real inbox','Pilot SQL reviewed and campaign matches repository content','Verified restaurant owner and staff sessions tested','Public company, privacy and campaign terms approved before launch']};
}
