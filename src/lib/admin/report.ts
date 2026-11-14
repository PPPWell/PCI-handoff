import {isUuid} from '../vouchers/pin-types';

export interface PlatformCounts {claimed:number;used:number;claimedPeriod:number;usedPeriod:number;claimedToday:number;usedToday:number}
export interface PlatformReport {date:string;days:number;users:{total:number;period:number;today:number};restaurants:(PlatformCounts&{restaurantId:string;name:string;status:string})[]}
export type PlatformReportState={kind:'found';report:PlatformReport}|{kind:'forbidden'|'signed-out'|'unconfigured'|'unavailable'};
export const reportDays=[7,30,90] as const;

function invalid():never{throw Error('Invalid platform report');}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function count(v:unknown){if(typeof v!=='number'||!Number.isInteger(v)||v<0)invalid();return v;}
function text(v:unknown,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)invalid();return v;}

export function parsePlatformReport(v:unknown):PlatformReport{
 const raw=object(v);if(raw.ok!==true||!Array.isArray(raw.restaurants))invalid();
 const date=text(raw.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))invalid();
 const users=object(raw.users);
 return {date,days:count(raw.days),users:{total:count(users.total),period:count(users.period),today:count(users.today)},restaurants:raw.restaurants.map(item=>{const r=object(item);if(!isUuid(r.restaurantId))invalid();
  return {restaurantId:String(r.restaurantId),name:text(r.name),status:text(r.status,20),claimed:count(r.claimed),used:count(r.used),claimedPeriod:count(r.claimedPeriod),usedPeriod:count(r.usedPeriod),claimedToday:count(r.claimedToday),usedToday:count(r.usedToday)};})};
}

/** Totals over every restaurant; the use rate is used / claimed, null before anything is claimed. */
export function platformTotals(report:PlatformReport):PlatformCounts&{rate:number|null}{
 const sum=(key:keyof PlatformCounts)=>report.restaurants.reduce((total,r)=>total+r[key],0);
 const claimed=sum('claimed'),used=sum('used');
 return {claimed,used,claimedPeriod:sum('claimedPeriod'),usedPeriod:sum('usedPeriod'),claimedToday:sum('claimedToday'),usedToday:sum('usedToday'),rate:claimed?used/claimed:null};
}

/** Poster channels (scans, claims, uses) and cookie-banner choices, from pci_channel_report. */
export interface ChannelRow {channel:string;scans:number;claimed:number;used:number}
export interface ChannelReport {days:number;channels:ChannelRow[];consent:{accept:number;reject:number}}
export function parseChannelReport(v:unknown):ChannelReport{
 const raw=object(v);if(raw.ok!==true||!Array.isArray(raw.channels))invalid();
 const consent=object(raw.consent);
 return {days:count(raw.days),consent:{accept:count(consent.accept),reject:count(consent.reject)},channels:raw.channels.map(item=>{const r=object(item);const channel=text(r.channel,24);if(!/^[a-z0-9-]{1,24}$/.test(channel))invalid();return {channel,scans:count(r.scans),claimed:count(r.claimed),used:count(r.used)};})};
}
/** Share of banner answers that accepted analytics; null before anyone answered. */
export function consentRate(consent:ChannelReport['consent']):number|null{const total=consent.accept+consent.reject;return total?consent.accept/total:null;}
