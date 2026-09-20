export function registrationDateParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: get('hour') };
}

function registrationInstant(date: unknown, hour: unknown) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date || typeof hour !== 'string' || !/^(0[0-9]|1[0-9]|2[0-3])$/.test(hour)) throw new Error('Vælg en gyldig dato og en hel time.');
  const candidates = [1, 2].map(offset => new Date(Date.parse(`${date}T${hour}:00:00Z`) - offset * 3600000).toISOString())
    .filter(value => { const local = registrationDateParts(value); return local.date === date && local.hour === hour; });
  if (candidates.length !== 1) throw new Error('Denne time springes over eller forekommer to gange ved skift mellem sommer- og vintertid. Vælg en anden time.');
  return candidates[0];
}

export function registrationSchedule(input: Record<string, unknown>) {
  const instant = (kind: 'opens' | 'closes') => {
    const time = input[`${kind}Time`];
    if (time === undefined) return registrationInstant(input[`${kind}Date`],input[`${kind}Hour`]);
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Angiv tidspunkt som hh:mm.');
    return new Date(Date.parse(registrationInstant(input[`${kind}Date`],time.slice(0,2))) + Number(time.slice(3)) * 60000).toISOString();
  };
  const registrationOpensAt = instant('opens');
  const registrationClosesAt = instant('closes');
  if (registrationOpensAt >= registrationClosesAt) throw new Error('Sluttidspunktet skal være efter starttidspunktet.');
  return { registrationOpensAt, registrationClosesAt };
}

type RegistrationWindow = {
  registrationOverride: "auto" | "open" | "closed";
  registrationOpensAt: string;
  registrationClosesAt: string;
  status: string;
};

export function registrationIsOpen(event: RegistrationWindow, now = Date.now()) {
  if (event.status === "cancelled") return false;
  if (event.registrationOverride === "open") return true;
  if (event.registrationOverride === "closed") return false;
  return now >= Date.parse(event.registrationOpensAt) && now <= Date.parse(event.registrationClosesAt);
}

export function firstMatchInstant(date: string, starts: readonly string[]) {
  const first = starts.map(time => time.replace('.', ':')).filter(time => /^\d{2}:\d{2}$/.test(time)).sort()[0];
  if (!first) throw new Error('Første kamptid mangler.');
  const [hour, minute] = first.split(':');
  if (Number(minute) > 59) throw new Error('Ugyldig kamptid.');
  return new Date(Date.parse(registrationInstant(date, hour)) + Number(minute) * 60000).toISOString();
}

export function waitlistIsOpen(event: RegistrationWindow, firstMatchAt: string, now = Date.now()) {
  return event.status !== 'cancelled' && !registrationIsOpen(event, now)
    && now > Date.parse(event.registrationClosesAt) && now < Date.parse(firstMatchAt);
}
