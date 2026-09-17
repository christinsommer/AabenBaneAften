import {normalizeKampplanRows} from './kampplan-rows.js';

type Registration = {
  player: {id: number; name: string};
  signup: {status: string; requestedHours: number; availability: string; signupOrder?: number | null};
};
export type UnfulfilledWish = {
  id: number; name: string; requested: number; assigned: number | null; missing: number | null;
  availability: string[]; assignedTimes: string[]; status: string; note: string;
};
const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');

// Calculate from the displayed plan, including imported plans, rather than a stale solver response.
export function unfulfilledWishes(rows: Record<string, unknown>[], registrations: Registration[]): UnfulfilledWish[] {
  const matches = normalizeKampplanRows(rows);
  const nameCounts = new Map<string, number>();
  for (const {player} of registrations) {
    const name = normalizeName(player.name);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return registrations.filter(({signup}) => ['active', 'waitlist'].includes(signup.status) && signup.requestedHours > 0)
    .map(({player, signup}) => {
      const name = normalizeName(player.name);
      const ambiguous = nameCounts.get(name)! > 1;
      const assignedTimes = matches.filter(row => ['D', 'E', 'F', 'G'].some(key => normalizeName(row[key]) === name))
        .map(row => row.A.replace('.', ':')).sort();
      const assigned = ambiguous ? null : assignedTimes.length;
      return {
        id: player.id, name: player.name, requested: signup.requestedHours, assigned,
        missing: assigned === null ? null : Math.max(0, signup.requestedHours - assigned),
        availability: JSON.parse(signup.availability) as string[], assignedTimes: ambiguous ? [] : assignedTimes,
        status: signup.status === 'waitlist' ? 'Venteliste' : 'Tilmeldt',
        note: ambiguous ? 'Flere medlemmer har samme navn. Kontrollér tildelingen manuelt.' : '',
      };
    }).filter(wish => wish.missing === null || wish.missing > 0)
    .sort((a, b) => (a.assigned ?? -1) - (b.assigned ?? -1) || a.name.localeCompare(b.name, 'da'));
}
