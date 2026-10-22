// t132u FIX-07: one structured line per event, always with a UTC ISO-8601 `ts` (plus the worker's line prefix).
export function logEvent(event, fields = {}, {now = () => new Date(), out = console.log} = {}) {
  const line = `${event} ${JSON.stringify({ts: now().toISOString(), ...fields})}`;
  out(line);
  return line;
}
