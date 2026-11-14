import {redirect} from 'next/navigation';
// Typing a code is a sheet on the scan page now; old links and home-screen shortcuts open it there.
export default async function MerchantManual({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams,restaurant=typeof params.restaurant==='string'?params.restaurant:undefined;redirect('/it/merchant/scan/?'+new URLSearchParams({...(restaurant?{restaurant}:{}),code:'1'}).toString());}
