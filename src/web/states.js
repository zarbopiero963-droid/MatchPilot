// MP-UI-PR-007 (MP-REQ-UI-1043, 1029, 1032, 1010): the shared states of every view, without DOM, so a unit test reads
// them as the page does.
// - Badges: one table, one shape (kind, text, title). The kinds are the owner's (D12-1 DEMO, D12-10 NON_PIT; PIT;
//   NON DISPONIBILE; N/D). The short Italian texts proposed in Q6 (MP-REQ-UI-1044) are not approved: the badge says the
//   kind itself and the title explains it.
// - HTTP failures: one wording per status class, the same on every view; the code stays in data-code and the tooltip.

export const BADGES = Object.freeze({
  DEMO: Object.freeze({kind: 'DEMO', text: 'DEMO', title: 'Dati dimostrativi: non sono partite né quote reali.'}),
  PIT: Object.freeze({kind: 'PIT', text: 'PIT', title: 'Point-in-time: solo dati noti prima dell’inizio delle partite.'}),
  NON_PIT: Object.freeze({kind: 'NON_PIT', text: 'NON PIT', title: 'Non point-in-time: dati acquisiti dopo l’inizio o senza ora di acquisizione verificata; solo studio, non certificato.'}),
  UNAVAILABLE: Object.freeze({kind: 'UNAVAILABLE', text: 'NON DISPONIBILE', title: 'La fonte di questi dati non è disponibile.'}),
  ND: Object.freeze({kind: 'ND', text: 'N/D', title: 'Valore non disponibile.'}),
});

export function badgeSpec(kind) {
  if (!Object.hasOwn(BADGES, kind)) throw new Error(`unknown badge ${kind}`);
  return BADGES[kind];
}

// The PIT label of an API answer as a badge: only an explicit PIT is PIT; anything else declared (PIT_NOT_VERIFIED,
// NON_PIT_RESEARCH) is NON_PIT; nothing declared is no badge, never a guess.
export function pitBadgeKind(value) {
  if (value === 'PIT') return 'PIT';
  if (typeof value === 'string' && value.trim()) return 'NON_PIT';
  return null;
}

// The state of a failed request: {kind, text, badge}. 401 never reaches a view (the page goes to the login); a status
// the table does not know falls in its class (4xx refused, 5xx server), never in a blank page.
const HTTP_STATES = Object.freeze({
  0: {kind: 'network', text: 'Connessione non disponibile: i dati non sono stati caricati.'},
  400: {kind: 'refused', text: 'Richiesta non valida: controlla i valori e riprova.'},
  403: {kind: 'forbidden', text: 'Questo account non può vedere questi dati.'},
  404: {kind: 'not-found', text: 'Questi dati non esistono, o non esistono più.'},
  409: {kind: 'conflict', text: 'I dati sono cambiati nel frattempo: ricarica e riprova.'},
  413: {kind: 'too-large', text: 'Richiesta troppo grande: riducila e riprova.'},
  414: {kind: 'too-long', text: 'Richiesta troppo lunga: togli qualche filtro e riprova.'},
  429: {kind: 'busy', text: 'Troppe richieste in questo momento: riprova tra qualche secondo.'},
  500: {kind: 'server', text: 'Errore del server: i dati non sono stati caricati. Riprova più tardi.'},
  502: {kind: 'unavailable', text: 'I dati non sono disponibili in questo momento.', badge: 'UNAVAILABLE'},
  503: {kind: 'unavailable', text: 'I dati non sono disponibili in questo momento.', badge: 'UNAVAILABLE'},
  504: {kind: 'unavailable', text: 'I dati non sono disponibili in questo momento.', badge: 'UNAVAILABLE'},
});

export function httpErrorState(status, code = null) {
  // Only a failed connection is a network state; a page defect (status 0, another code) is the page's (review #252 F1).
  if (code === 'NETWORK') return HTTP_STATES[0];
  if (status === 0) return {kind: 'client', text: 'La pagina non è riuscita a mostrare i dati.'};
  if (code === 'BAD_ENVELOPE') return {kind: 'server', text: 'Risposta del server non valida: i dati non sono stati caricati.'};
  if (Object.hasOwn(HTTP_STATES, status)) return HTTP_STATES[status];
  if (status >= 500) return HTTP_STATES[500];
  if (status >= 400) return HTTP_STATES[400];
  return {kind: 'client', text: 'La pagina non è riuscita a mostrare i dati.'};
}

// MP-UI-PR-008-COV (MP-REQ-UI-1040, MP-WEB-011): a share of the API (exact decimal text in [0, 1], e.g. "0.9950") as a
// percentage, still as decimal text with a dot ("99.5"): the decimal point moves two places on the text itself, so the
// browser rounds nothing. Anything that is not such a text is null (the page shows N/D), never a guessed number.
export function percentText(value) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(typeof value === 'string' || typeof value === 'number' ? String(value) : '');
  if (!m) return null;
  const digits = `${m[1]}${(m[2] ?? '').padEnd(2, '0')}`;
  const cut = m[1].length + 2;
  const whole = digits.slice(0, cut).replace(/^0+(?=\d)/, '');
  const rest = digits.slice(cut).replace(/0+$/, '');
  return rest ? `${whole}.${rest}` : whole;
}
