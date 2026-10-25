type Member = {id: number; name: string};
type Signup = {playerId: number; status: string; requestedHours: number};
type StoredMatch = {startTime: string; playerIds: string};
type Slot = {start: number; end: number; ids: number[]};
export type ReplacementCandidate = Member & {requested: number; assigned: number; times: string[]};

const normalize = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
const minutes = (time: string) => { const [h, m] = time.split(/[:.]/).map(Number); return h * 60 + m; };
const label = (time: number) => `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;

export function replacementCandidates(userId: number, members: Member[], signups: Signup[], imported: Record<string, string>[], stored: StoredMatch[]): ReplacementCandidate[] {
  const byName = new Map<string, number[]>();
  for (const member of members) {
    const key = normalize(member.name);
    byName.set(key, [...(byName.get(key) ?? []), member.id]);
  }
  // Imported plans identify players by name. Never guess between namesakes.
  const ambiguous = new Set(members.filter(m => (byName.get(normalize(m.name))?.length ?? 0) > 1).map(m => m.id));
  if (imported.length && ambiguous.has(userId)) return [];
  const slots: Slot[] = imported.length
    ? imported.map(row => ({start: minutes(row.A), end: minutes(row.B), ids: ['D', 'E', 'F', 'G'].flatMap(key => byName.get(normalize(row[key] ?? '')) ?? [])}))
    : stored.map(match => ({start: minutes(match.startTime), end: minutes(match.startTime) + 60, ids: JSON.parse(match.playerIds) as number[]}));
  const own = slots.filter(slot => slot.ids.includes(userId));
  if (!own.length) return [];
  return signups.flatMap(signup => {
    if (signup.playerId === userId || !['active', 'waitlist'].includes(signup.status) || (imported.length && ambiguous.has(signup.playerId))) return [];
    const member = members.find(m => m.id === signup.playerId);
    if (!member) return [];
    const assignedSlots = slots.filter(slot => slot.ids.includes(member.id));
    const assigned = assignedSlots.reduce((hours, slot) => hours + (slot.end - slot.start) / 60, 0);
    if (signup.requestedHours <= assigned) return [];
    const available = own.filter(slot => !assignedSlots.some(other => other.start < slot.end && slot.start < other.end));
    const times = [...new Set(available.sort((a, b) => a.start - b.start).map(slot => `${label(slot.start)}–${label(slot.end)}`))];
    return times.length ? [{...member, requested: signup.requestedHours, assigned, times}] : [];
  }).sort((a, b) => a.assigned - b.assigned || a.name.localeCompare(b.name, 'da'));
}
