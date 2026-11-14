import type {PinBatch,PinFailure,PinResult} from './pin-types';
export interface PinSelection {requestId:string;voucherIds:string[]}
interface PinState {selection:PinSelection|null;batch:PinBatch|null;error:PinFailure|null;pending:boolean;unknown:boolean;operation:'redeem'|'undo'|null;undoClosed:boolean}
type Action={type:'recover';batch:PinBatch|null}|{type:'review';selection:PinSelection}|{type:'cancel'}|{type:'sending';operation:'redeem'|'undo'}|{type:'received';result:PinResult};
export function initialPinState(batch:PinBatch|null):PinState{return {selection:null,batch,error:null,pending:false,unknown:false,operation:null,undoClosed:false};}
/** Unknown responses freeze the request identity and selection, including while state refreshes. */
export function pinReducer(state:PinState,action:Action):PinState {
 if(action.type==='recover'){if(!action.batch||state.batch||state.pending||state.unknown)return state;return {...state,batch:action.batch};}
 if(action.type==='review'){if(state.pending||state.unknown)return state;return {...state,selection:action.selection,error:null,operation:null};}
 if(action.type==='cancel'){if(state.pending||state.unknown)return state;return {...state,selection:null,error:null,operation:null};}
 if(action.type==='sending'){if(state.pending||state.unknown&&state.operation!==action.operation)return state;return {...state,pending:true,error:null,operation:action.operation};}
 const result=action.result;
 if(result.ok)return {...state,selection:null,batch:result,pending:false,unknown:false,error:null,operation:null,undoClosed:result.undoneAt!==null};
 const unknown=result.code==='unavailable'||state.unknown&&!['state_changed','request_conflict','not_current','undo_window_closed'].includes(result.code);
 return {...state,pending:false,error:result,unknown,selection:!unknown&&state.operation==='redeem'&&['state_changed','request_conflict','not_found'].includes(result.code)?null:state.selection,undoClosed:state.undoClosed||state.operation==='undo'&&['not_current','undo_window_closed','not_found'].includes(result.code)};
}
