import {cache} from 'react';
import {clientContext} from '../merchant/server';
import {parsePlatformReport,parseChannelReport,type PlatformReportState,type ChannelReport} from './report';
import {parseAdminOverview,type AdminOverviewState} from './console';

/** Whether the signed-in person is a platform admin (pci_private.platform_members); false on any doubt. */
export const serverIsPlatformAdmin=cache(async():Promise<boolean>=>{
 try{const c=await clientContext();if(c.kind!=='ready')return false;const {data,error}=await c.client.rpc('pci_am_platform_admin');return !error&&data===true;}catch{return false;}
});

export async function serverPlatformReport(days:number):Promise<PlatformReportState>{
 try{const c=await clientContext();if(c.kind!=='ready')return {kind:c.kind==='signed-out'?'signed-out':c.kind==='unconfigured'?'unconfigured':'unavailable'};
  const {data,error}=await c.client.rpc('pci_platform_report',{p_days:days});if(error)return {kind:'unavailable'};
  if(data&&typeof data==='object'&&(data as {code?:unknown}).code==='forbidden')return {kind:'forbidden'};
  return {kind:'found',report:parsePlatformReport(data)};}catch{return {kind:'unavailable'};}
}

export async function serverAdminOverview():Promise<AdminOverviewState>{
 try{const c=await clientContext();if(c.kind!=='ready')return {kind:c.kind==='signed-out'?'signed-out':c.kind==='unconfigured'?'unconfigured':'unavailable'};
  const {data,error}=await c.client.rpc('pci_admin_overview');if(error)return {kind:'unavailable'};
  if(data&&typeof data==='object'&&(data as {code?:unknown}).code==='forbidden')return {kind:'forbidden'};
  return {kind:'found',restaurants:parseAdminOverview(data)};}catch{return {kind:'unavailable'};}
}

/** Poster channels and banner choices for the stats page; null on any doubt (the page then simply leaves the section out). */
export async function serverChannelReport(days:number):Promise<ChannelReport|null>{
 try{const c=await clientContext();if(c.kind!=='ready')return null;
  const {data,error}=await c.client.rpc('pci_channel_report',{p_days:days});if(error)return null;
  return parseChannelReport(data);}catch{return null;}
}
