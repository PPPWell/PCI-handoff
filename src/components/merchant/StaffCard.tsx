"use client";
import Image from "next/image";

/** The counter card: four rules staff need, the words they will see, and a QR that opens the scanner. Printed on A6. */
export function StaffCard({restaurant,qr}:{restaurant?:string|null;qr:string|null}){
 return <>
  <article className="staff-print" aria-label="Scheda da stampare">
   <header><p className="staff-print__brand">Palazzo Italia-Cina</p><h2>Coupon: come convalidare</h2>{restaurant&&<p className="staff-print__place">{restaurant}</p>}</header>
   <ol className="staff-print__steps">
    <li><strong>Prima di ordinare</strong> il cliente mostra il coupon.</li>
    <li><strong>Scansionate il QR</strong> con l’app Ristorante (o inserite le 6 cifre).</li>
    <li><strong>Leggete la parola grande:</strong>
     <ul><li><b>VALIDO</b> → Convalidate e applicate lo sconto.</li><li><b>FUORI ORARIO</b> → decidete voi.</li><li><b>GIÀ USATO · SCADUTO · ALTRO LOCALE</b> → niente sconto.</li></ul></li>
    <li><strong>Errore?</strong> La convalida è definitiva: scriveteci e la correggiamo noi.</li>
   </ol>
   <footer>{qr&&<Image src={qr} alt="QR per aprire la scansione" width={120} height={120} unoptimized />}<p>Inquadrate per aprire la scansione.<br />Problemi: info@palazzoitaliacina.com</p></footer>
  </article>
  <button type="button" className="button button--primary staff-action staff-print__button" onClick={()=>window.print()}>Stampa</button>
 </>;
}
