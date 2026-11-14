-- Staff can no longer undo a coupon redemption (the two-minute undo is removed). A redemption is final; a mistake is corrected by the
-- platform. Redemptions already undone before this change keep their records. The function stays so old clients get a clear answer.
begin;
create or replace function public.pci_undo_discount_coupon(p_redemption uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return jsonb_build_object('ok',false,'code','undo_closed');
end $$;
commit;
