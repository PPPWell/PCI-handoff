import type{CouponView}from'./types';
export interface CouponFlow{view:CouponView;pending:boolean;unknown:boolean;operation:'redeem'|'undo'|null;requestId:string|null;error:string;undoClosed:boolean}
export type CouponFlowAction={type:'start';operation:'redeem'|'undo';requestId:string}|{type:'success';view:CouponView}|{type:'failure';code:string}|{type:'read';view:CouponView};
export const initialCouponFlow=(view:CouponView):CouponFlow=>({view,pending:false,unknown:false,operation:null,requestId:null,error:'',undoClosed:false});
export function couponFlowReducer(state:CouponFlow,action:CouponFlowAction):CouponFlow{
 if(action.type==='start'){if(state.pending||state.unknown&&(state.operation!==action.operation||state.requestId!==action.requestId))return state;return{...state,pending:true,operation:action.operation,requestId:action.requestId,error:''};}
 if(action.type==='failure'){const closed=state.operation==='undo'&&action.code==='undo_closed';return{...state,pending:false,unknown:closed?false:state.unknown||action.code==='unavailable',error:action.code,undoClosed:state.undoClosed||closed};}
 if(action.view.coupon.id!==state.view.coupon.id)return state;
 if(action.type==='success'){if(!state.requestId||action.view.redemption?.id!==state.requestId)return state;return{...state,view:action.view,pending:false,unknown:false,error:'',operation:null,requestId:null,undoClosed:false};}
 if(state.pending)return state;
 if(state.unknown&&state.operation==='redeem'&&action.view.redemption?.id===state.requestId)return{...state,view:action.view,pending:false,unknown:false,error:'',operation:null,requestId:null};
 return{...state,view:action.view};
}

/** Build the retry from operation identity, even when a newer read omits its receipt. */
export function couponMutation(state:CouponFlow,operation:'redeem'|'undo',confirmed:boolean,proposedId:string){
 if(state.pending||state.unknown&&state.operation!==operation)return null;
 if(state.unknown){if(!state.requestId)return null;return operation==='redeem'?{action:'redeem' as const,couponId:state.view.coupon.id,requestId:state.requestId}:{action:'undo' as const,couponId:state.view.coupon.id,redemptionId:state.requestId};}
 if(operation==='redeem')return confirmed&&state.view.coupon.status==='unused'?{action:'redeem' as const,couponId:state.view.coupon.id,requestId:proposedId}:null;
 return state.view.redemption&&!state.view.redemption.undoneAt?{action:'undo' as const,couponId:state.view.coupon.id,redemptionId:state.view.redemption.id}:null;
}
