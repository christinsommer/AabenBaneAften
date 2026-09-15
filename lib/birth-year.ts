import {copenhagenDate} from './calendar.ts';

export function currentYear(now = new Date()) {
  return Number(copenhagenDate(now).slice(0, 4));
}

export function birthYearOptions(now = new Date()) {
  const latest = currentYear(now) - 16;
  return Array.from({length: Math.max(0, latest - 1940 + 1)}, (_, index) => latest - index);
}

export function ageFromBirthYear(birthYear: number | null | undefined, now = new Date()): number | null {
  return birthYear == null ? null : currentYear(now) - birthYear;
}
