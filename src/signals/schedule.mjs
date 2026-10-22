// SIM-SCHEDULE-01: resolve the --date argument of the simulated-signal job so a timer can run it unattended.
// Relative days are calendar days in Europe/Rome (the owner's zone), DST-safe; explicit dates are validated strictly.
export const SCHEDULE_ZONE = 'Europe/Rome';
const romeDay = instant => new Intl.DateTimeFormat('en-CA', {timeZone: SCHEDULE_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).format(instant);
const shift = (ymd, days) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export function resolveDate(arg, now = new Date()) {
  const value = String(arg ?? '').trim();
  if (value === 'today') return romeDay(now);
  if (value === 'yesterday') return shift(romeDay(now), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}
