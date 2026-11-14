export interface OrderAmountInput {
  unitAmountCents:number;quantity:number;commissionBps:number;commissionVatBps:number;merchantVatBps:number|null;trial:boolean;
}
function integer(value:number,max=Number.MAX_SAFE_INTEGER) {
  if(!Number.isSafeInteger(value)||value<0||value>max) throw new RangeError("Invalid monetary input");
  return BigInt(value);
}
function safe(value:bigint) {if(value>BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Unsafe monetary result");return Number(value);}
function round(numerator:bigint,denominator:bigint) {return (numerator+denominator/2n)/denominator;}
/** Round once per voucher so full and partial refunds return the exact same fee snapshots. */
export function calculateOrderAmounts(input:OrderAmountInput) {
  const unit=integer(input.unitAmountCents),quantity=integer(input.quantity,6),rate=integer(input.commissionBps,10000),vatRate=integer(input.commissionVatBps,10000);
  if(quantity<1n||typeof input.trial!=="boolean") throw new RangeError("Invalid order input");
  const merchantVat=input.merchantVatBps===null?null:integer(input.merchantVatBps,10000);
  const commission=input.trial?0n:round(unit*rate,10000n),commissionVat=round(commission*vatRate,10000n),includedVat=merchantVat===null?null:round(unit*merchantVat,10000n+merchantVat);
  if(commission+commissionVat>unit) throw new RangeError("Commission exceeds voucher value");
  return {unitAmountCents:safe(unit),unitCommissionCents:safe(commission),unitCommissionVatCents:safe(commissionVat),unitIncludedVatCents:includedVat===null?null:safe(includedVat),totalAmountCents:safe(unit*quantity),totalCommissionCents:safe(commission*quantity),totalCommissionVatCents:safe(commissionVat*quantity),applicationFeeCents:safe((commission+commissionVat)*quantity),totalIncludedVatCents:includedVat===null?null:safe(includedVat*quantity)};
}
