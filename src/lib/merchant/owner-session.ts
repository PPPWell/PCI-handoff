import type {OwnerOperation,OwnerRequest} from './owner-types';
export interface OwnerFlow {request:OwnerRequest|null;result:OwnerOperation|null;restaurantId:string|null;restaurantName:string|null;pending:boolean;unknown:boolean;error:string|null}
type Action={type:'review';request:OwnerRequest;restaurantName?:string}|{type:'sending'}|{type:'failure';code:string}|{type:'success'|'recover';result:OwnerOperation}|{type:'reset'};
export const initialOwnerFlow=():OwnerFlow=>({request:null,result:null,restaurantId:null,restaurantName:null,pending:false,unknown:false,error:null});
export function ownerReducer(state:OwnerFlow,action:Action):OwnerFlow{
 if(action.type==='reset')return state.pending||state.unknown?state:initialOwnerFlow();
 if(action.type==='review')return state.pending||state.unknown||state.request?state:{...initialOwnerFlow(),request:{...action.request},restaurantId:action.request.restaurantId,restaurantName:action.restaurantName??null};
 if(action.type==='sending')return !state.request||state.pending?state:{...state,pending:true,error:null};
 if(action.type==='failure'){const unknown=action.code==='unavailable'||state.unknown&&!['invalid_request','invalid_pin','incorrect_pin','pin_locked','state_changed','request_conflict'].includes(action.code);return {...state,pending:false,error:action.code,unknown,request:unknown?state.request:null};}
 const result=action.result,expected=state.request?.requestId??state.result?.operationId,expectedKind=state.request?.action==='pin'?'pin':state.request?.action==='disconnect'?(state.request.deviceId===null?'revoke_others':'revoke'):state.result?.kind;if(result.kind!==expectedKind||result.operationId!==expected||action.type==='recover'&&state.pending||state.result&&state.result.currentPinRevision>result.currentPinRevision)return state;
 return {...state,request:null,result:{...result},pending:false,unknown:false,error:null};
}
/** Only stable layout memory: never browser storage, URL, analytics or logs. */
export const ownerEditorKey=(context:{actorKey:string;restaurantId:string}|null)=>context?context.actorKey+':'+context.restaurantId:'no-context';
export function createOwnerSession(){let state=initialOwnerFlow();const listeners=new Set<()=>void>();return {getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},dispatch:(action:Action)=>{const previous=state,next=ownerReducer(state,action);if(next===state)return false;const resolved=Boolean(previous.request&&next.request===null&&(action.type==='success'||action.type==='recover'));state=next;for(const listener of listeners)listener();return resolved;}};}
