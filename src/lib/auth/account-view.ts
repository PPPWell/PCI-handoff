import type {AccountOrder,AccountVoucher} from './account';
export type AccountGroup='usable'|'used'|'inactive';
export function groupAccountVouchers(orders:AccountOrder[]):Record<AccountGroup,{order:AccountOrder;voucher:AccountVoucher}[]> {
 const groups:ReturnType<typeof groupAccountVouchers>={usable:[],used:[],inactive:[]};for(const order of orders)for(const voucher of order.vouchers)groups[voucher.usable?'usable':voucher.status==='redeemed'?'used':'inactive'].push({order,voucher});return groups;
}
