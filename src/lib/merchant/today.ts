import type {CouponReport} from '../coupons/types';

/** Coupons redeemed today (undone ones are not counted), summed over the restaurant's menus. */
export const todayTotal=(report:CouponReport)=>report.menus.reduce((sum,m)=>sum+m.todayLunch+m.todayDinner,0);
