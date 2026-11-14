"use client";
import {createContext,useContext,useState,useSyncExternalStore,type ReactNode} from 'react';
import {createPinSession} from '@/lib/vouchers/pin-session';
import type {PinBatch} from '@/lib/vouchers/pin-types';
const PinContext=createContext<ReturnType<typeof createPinSession>|null>(null);
export function PinSessionProvider({children,initialBatch=null}:{children:ReactNode;initialBatch?:PinBatch|null}) {
 const parent=useContext(PinContext),[session]=useState(()=>createPinSession(initialBatch));
 // The real route owns its session in the stable layout. Standalone rendering can own one here.
 return parent?children:<PinContext.Provider value={session}>{children}</PinContext.Provider>;
}
export function usePinSession() {
 const session=useContext(PinContext);if(!session)throw Error('Voucher PIN session missing');
 return [useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot),session.dispatch] as const;
}
