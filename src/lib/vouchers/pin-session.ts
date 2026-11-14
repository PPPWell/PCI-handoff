import {initialPinState,pinReducer} from './pin-state';
import type {PinBatch} from './pin-types';
/** One in-memory session per mounted voucher layout; survives replacement of read-only page consumers. */
export function createPinSession(batch:PinBatch|null) {
 let state=initialPinState(batch);const listeners=new Set<()=>void>();
 return {getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},dispatch:(action:Parameters<typeof pinReducer>[1])=>{const next=pinReducer(state,action);if(next===state)return;state=next;for(const listener of listeners)listener();}};
}
