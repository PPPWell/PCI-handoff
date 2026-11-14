/** Shown while a restaurant page loads: keeps the dark top bar so the screen never flashes to the site-wide loader. */
export default function MerchantLoading(){return <><div className="staff-topbar" aria-hidden="true" /><main className="staff-page" lang="it"><p role="status" className="staff-lead">Caricamento…</p></main></>;}
