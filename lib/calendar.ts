import {initialRegistrationDefaults, parseRegistrationDefaults, type RegistrationDefaults} from './registration-defaults.ts';

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const copenhagenDateFormatter = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Copenhagen",year:"numeric",month:"2-digit",day:"2-digit"});

export function copenhagenDate(now = new Date()) {
  const parts = copenhagenDateFormatter.formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function calendarEvent(date: string, defaults: RegistrationDefaults = initialRegistrationDefaults) {
  const settings = parseRegistrationDefaults(defaults);
  if (!validDate(date)) throw new Error("Vælg en gyldig dato.");
  const offsetDate = (days: number) => {
    const result = new Date(`${date}T12:00:00Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0,10);
  };
  const instant = (days: number, time: string) => {
    const localDate = offsetDate(-days);
    const candidates = [1,2].map(offset => new Date(Date.parse(`${localDate}T${time}:00Z`) - offset * 3600000));
    const formatter = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const valid = candidates.filter(value => copenhagenDate(value) === localDate && formatter.format(value) === time);
    if (valid.length !== 1) throw new Error('Tilmeldingstidspunktet springes over eller forekommer to gange ved skift af sommer-/vintertid. Vælg et andet tidspunkt.');
    return valid[0].toISOString();
  };
  return {date, registrationOpensAt:instant(settings.openDays,settings.openTime), registrationClosesAt:instant(settings.closeDays,settings.closeTime)};
}

export function fridayDates(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error("Vælg et gyldigt datointerval.");
  const dates: string[] = [];
  const day = new Date(`${start}T12:00:00Z`);
  while (day.toISOString().slice(0,10) <= end) {
    if (day.getUTCDay() === 5) dates.push(day.toISOString().slice(0,10));
    day.setUTCDate(day.getUTCDate()+1);
  }
  return dates;
}
