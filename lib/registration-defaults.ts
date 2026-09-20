export const initialRegistrationDefaults = {openDays:2, openTime:'06:00', closeDays:1, closeTime:'12:00'};
export type RegistrationDefaults = typeof initialRegistrationDefaults;

export function parseRegistrationDefaults(input: Record<string, unknown>): RegistrationDefaults {
  const {openDays,openTime,closeDays,closeTime} = input;
  for (const days of [openDays,closeDays]) if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 6)
    throw new Error('Antal dage før skal være et heltal fra 1 til 6.');
  for (const time of [openTime,closeTime]) if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Tidspunkt skal angives som hh:mm.');
  if ((closeDays as number) > (openDays as number) || closeDays === openDays && (closeTime as string) <= (openTime as string))
    throw new Error('Tilmeldingen skal lukke efter den åbner.');
  return {openDays,openTime,closeDays,closeTime} as RegistrationDefaults;
}
