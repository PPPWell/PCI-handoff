import {MerchantOwnerSessionProvider} from '@/components/merchant/MerchantOwnerSessionProvider';
import type {Metadata,Viewport} from 'next';import type {ReactNode} from 'react';
// The restaurant area can be added to the home screen as its own app that opens on scanning.
export const metadata:Metadata={title:'Area ristorante | Palazzo Italia-Cina',robots:{index:false,follow:false},referrer:'no-referrer',manifest:'/merchant.webmanifest',appleWebApp:{capable:true,title:'Ristorante',statusBarStyle:'black'},icons:{apple:'/icons/merchant-180.png'}};
export const viewport:Viewport={themeColor:'#2c3a2b'};
export const dynamic='force-dynamic';export const runtime='nodejs';
export default function MerchantLayout({children}:{children:ReactNode}){return <MerchantOwnerSessionProvider><div className="staff-shell" lang="it">{children}</div></MerchantOwnerSessionProvider>;}
