import type {ManagementPurpose,ManagementSuccess} from './types';
interface State {phase:'choose'|'code'|'confirm'|'result';purpose:ManagementPurpose|null;proofId:string|null;pending:boolean;unknown:boolean;action:'start'|'verify'|'confirm'|null;error:string|null;result:ManagementSuccess|null}
type Action={type:'begin';action:'start'|'verify'|'confirm';purpose:ManagementPurpose}|{type:'sent'}|{type:'verified';proofId:string}|{type:'failed';code:string}|{type:'completed';result:ManagementSuccess}|{type:'read';operation:ManagementSuccess|null}|{type:'cancel'};
export function initialManagementState():State{return {phase:'choose',purpose:null,proofId:null,pending:false,unknown:false,action:null,error:null,result:null};}
export function managementReducer(s:State,a:Action):State {
 if(a.type==='begin'){if(s.pending||s.unknown&&(a.action!=='confirm'||a.purpose!==s.purpose))return s;return {...s,pending:true,purpose:a.purpose,action:a.action,error:null};}
 if(a.type==='cancel')return s.pending||s.unknown?s:initialManagementState();
 if(a.type==='sent')return {...s,phase:'code',pending:false,error:null};
 if(a.type==='verified')return {...s,phase:'confirm',proofId:a.proofId,pending:false,error:null};
 if(a.type==='failed')return {...s,pending:false,error:a.code,unknown:s.unknown||s.action==='confirm'&&a.code==='unavailable'};
 if(a.type==='read'){if(!a.operation||a.operation.operationId!==s.proofId||a.operation.purpose!==s.purpose)return s;return {...s,phase:'result',pending:false,unknown:false,result:a.operation,error:null};}
 return {...s,phase:'result',pending:false,unknown:false,result:a.result,error:null};
}
