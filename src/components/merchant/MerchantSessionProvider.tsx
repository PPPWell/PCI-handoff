"use client";
import {createContext,useContext,useState,useSyncExternalStore,type ReactNode} from 'react';
import {createMerchantSession} from '@/lib/merchant/session';
const Context=createContext<ReturnType<typeof createMerchantSession>|null>(null);
export function MerchantSessionProvider({children}:{children:ReactNode}){const parent=useContext(Context),[session]=useState(createMerchantSession);return parent?children:<Context.Provider value={session}>{children}</Context.Provider>;}
export function useMerchantSession(){const session=useContext(Context);if(!session)throw Error('Merchant session missing');return [useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot),session.dispatch] as const;}
