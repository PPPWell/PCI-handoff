import type {PinBatch} from '../vouchers/pin-types';
export interface MerchantSelection {requestId:string;voucherIds:string[]}
export interface MerchantFlow {selection:MerchantSelection|null;batch:PinBatch|null;pending:boolean;unknown:boolean;operation:'redeem'|'undo'|null;error:string|null;undoClosed:boolean}
type Action={type:'reset'}|{type:'review';selection:MerchantSelection}|{type:'cancel'}|{type:'sending';operation:'redeem'|'undo'}|{type:'failure';code:string}|{type:'success';batch:PinBatch}|{type:'recover';batch:PinBatch|null};
export const initialMerchantFlow=():MerchantFlow=>({selection:null,batch:null,pending:false,unknown:false,operation:null,error:null,undoClosed:false});
export function merchantReducer(s:MerchantFlow,a:Action):MerchantFlow {
 if(a.type==='reset')return s.pending||s.unknown?s:initialMerchantFlow();
 if(a.type==='review')return s.pending||s.unknown?s:{...s,selection:a.selection,error:null,operation:null};
 if(a.type==='cancel')return s.pending||s.unknown?s:{...s,selection:null,error:null};
 if(a.type==='sending')return s.pending||s.unknown&&s.operation!==a.operation?s:{...s,pending:true,operation:a.operation,error:null};
 if(a.type==='failure'){const unknown=a.code==='unavailable'||s.unknown&&!['state_changed','request_conflict','not_current','undo_window_closed','invalid_time'].includes(a.code);return {...s,pending:false,error:a.code,unknown,selection:!unknown&&s.operation==='redeem'?null:s.selection,undoClosed:s.undoClosed||s.operation==='undo'&&['not_current','undo_window_closed','invalid_time'].includes(a.code)};}
 if(a.type==='recover'){if(!a.batch||s.pending)return s;if(s.unknown){const expected=s.operation==='redeem'?s.selection?.requestId:s.batch?.batchId;if(a.batch.batchId!==expected||s.operation==='undo'&&!a.batch.undoneAt)return s;}else if(s.selection||s.batch&&(s.batch.batchId!==a.batch.batchId||Date.parse(a.batch.serverNow)<Date.parse(s.batch.serverNow)||s.batch.undoneAt&&!a.batch.undoneAt))return s;}
 const batch=a.batch;if(!batch)return s;return {...s,selection:null,batch,pending:false,unknown:false,operation:null,error:null,undoClosed:batch.undoneAt!==null};
}
/** Stable layout memory only: no PIN, JWT or browser storage. */
export function createMerchantSession(){let state=initialMerchantFlow();const listeners=new Set<()=>void>();return {getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},dispatch:(action:Action)=>{const next=merchantReducer(state,action);if(next===state)return;state=next;for(const listener of listeners)listener();}};}
/** Never replace an unresolved staff operation with the customer's PIN controls. */
export function merchantFlowVisible(kind:string,flow:MerchantFlow){return kind==='found'||flow.pending||flow.unknown||flow.batch!==null;}
