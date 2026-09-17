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

function hourInCopenhagen(date: string, hour: number) {
  const utcNoon = new Date(`${date}T12:00:00Z`);
  const localHour = Number(new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Copenhagen",hour:"2-digit",hourCycle:"h23"}).format(utcNoon));
  return new Date(utcNoon.getTime() - (localHour - hour) * 3600000).toISOString();
}

export function calendarEvent(date: string) {
  if (!validDate(date)) throw new Error("Vælg en gyldig dato.");
  const offsetDate = (days: number) => {
    const result = new Date(`${date}T12:00:00Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0,10);
  };
  return {date, registrationOpensAt:hourInCopenhagen(offsetDate(-2), 6), registrationClosesAt:hourInCopenhagen(offsetDate(-1), 12)};
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
