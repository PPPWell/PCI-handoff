-- 11.11 is defined in Italian local time: the window runs from 11 Nov 00:00 to 12 Nov 00:00 in Italy (= 11 Nov 07:00 to 12 Nov 07:00 in Beijing).
-- The first version of the window started at 11.11 00:00 in Beijing (10 Nov 17:00 in Italy). The cap, the end and the 150 places are unchanged.
begin;
update pci_private.discount_promos set starts_at=timestamptz '2026-11-11 00:00:00+01' where id='double-eleven-2026';
commit;
