"use client";
import type {PlatformReport} from '@/lib/admin/report';

/** Builds the CSV in the browser from the numbers already on the page: no extra endpoint, nothing stored. */
export function statsCsv(report:PlatformReport):string{
 const cell=(v:string|number)=>{const s=String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
 const head=['restaurant','status','claimed_today','used_today',`claimed_${report.days}d`,`used_${report.days}d`,'claimed_total','used_total'];
 const rows=report.restaurants.map(r=>[r.name,r.status,r.claimedToday,r.usedToday,r.claimedPeriod,r.usedPeriod,r.claimed,r.used]);
 return [head,...rows].map(row=>row.map(cell).join(',')).join('\n')+'\n';
}

export function StatsExport({report,label}:{report:PlatformReport;label:string}){
 return <button type="button" className="button button--secondary" onClick={()=>{
  const url=URL.createObjectURL(new Blob(['﻿'+statsCsv(report)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`palazzo-stats-${report.date}-${report.days}d.csv`;a.click();URL.revokeObjectURL(url);
 }}>{label}</button>;
}
