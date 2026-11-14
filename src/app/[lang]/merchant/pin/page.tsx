import {redirect} from 'next/navigation';
// The PIN only served prepaid vouchers, which are not offered: owners land on Locale instead.
export default function MerchantPin(){redirect('/it/merchant/locale/');}
