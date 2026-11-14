"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Icon,type IconName} from "@/components/ui/Icon";

/** Staff bottom tab bar: scanning first, then today's log, then Locale for owners (month, phones, staff) or Account for
 * staff and admins (guide, help, sign out). Typing a code lives on the scan page. */
export function MerchantNav({restaurantId,owner=false}:{restaurantId?:string;owner?:boolean}){
 const query=restaurantId?'?'+new URLSearchParams({restaurant:restaurantId}).toString():'';
 const path=(usePathname()||'').replace(/\/$/,'');
 const tabs:[string,string,IconName][]=[['scan','Scansiona','scan'],['today','Oggi','list'],owner?['locale','Locale','store']:['locale','Account','account']];
 return <nav className="staff-nav" aria-label="Area ristorante" lang="it">
  <ul className="staff-tabs" data-count={tabs.length}>
   {tabs.map(([id,label,icon])=><li key={id}><Link href={`/it/merchant/${id}/`+query} aria-current={path.endsWith('/merchant/'+id)?'page':undefined}><Icon name={icon} /><span>{label}</span></Link></li>)}
  </ul>
 </nav>;
}
