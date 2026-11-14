import type {PinFailureCode} from './pin-types';
/** Restaurant fallback is deliberately Italian first in every locale. */
export const pinErrors:Record<PinFailureCode,string>={
 not_found:'Link non valido o non più disponibile. Aggiornate la pagina.',
 invalid_request:'Controllate i dati e riprovate.',invalid_selection:'Selezione non valida. Aggiornate la pagina.',
 incorrect_pin:'PIN errato.',invalid_pin:'Inserite il PIN di quattro cifre.',
 pin_locked:'Troppi tentativi. PIN temporaneamente bloccato.',pin_not_configured:'Il PIN del ristorante non è ancora configurato. Contattate il responsabile.',
 request_conflict:'Questa richiesta non corrisponde alla selezione. Aggiornate la pagina.',
 state_changed:'La selezione non è più utilizzabile. Aggiornate lo stato prima di scegliere di nuovo.',
 undo_window_closed:'Sono trascorsi i due minuti disponibili per annullare.',not_current:'Questo utilizzo è già cambiato e non può essere annullato qui.',
 unavailable:'Esito non confermato. Non iniziate un altro utilizzo: riprovate con la stessa richiesta per verificarne il risultato.'
};
