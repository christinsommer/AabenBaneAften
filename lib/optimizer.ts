export const algorithmWeightDefaults = {
  FactorMatchDifference: 40, FactorSameTeamDifference: 15, FactorSameTeamLastWeek: 20, FactorSameTeam3Weeks: 10,
  FactorOpponentLastWeek: 5, FactorMix: 10, FactorAge: 0,
};
export type AlgorithmWeights = typeof algorithmWeightDefaults;
export type OptimizerPlayer = {
  id: number; memberNo: string; cr: number; gender: 'M' | 'K'; age: number | null;
  availability: string[]; requestedHours: number; signupOrder: number; status: 'active' | 'waitlist';
};
export type ProposedMatch = { court: number; startTime: string; team1: number[]; team2: number[] };
export type HistoryRound = { date: string; matches: { team1: number[]; team2: number[] }[] };
export type OptimizerInput = {
  players: OptimizerPlayer[]; slots: { court: number; startTime: string }[];
  history: HistoryRound[]; locked: ProposedMatch[]; weights: AlgorithmWeights;
};
export const HISTORY_START = '2026-09-18';
export const forbiddenMemberPairs = [['17108', '13993'], ['17108', '16212'], ['11822', '15722']];
export const minutes = (time: string) => {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Ugyldigt tidspunkt.');
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) throw new Error('Ugyldigt tidspunkt.');
  return h * 60 + m;
};
export const pairKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
export function parseAlgorithmWeights(raw: unknown): AlgorithmWeights {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Vægtene mangler.');
  return Object.fromEntries(Object.entries(algorithmWeightDefaults).map(([key, fallback]) => {
    const value = (raw as Record<string, unknown>)[key];
    const number = value === '' || value === undefined ? fallback : value;
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || Math.abs(number) > 1_000_000)
      throw new Error(`${key} skal være et heltal mellem -1000000 og 1000000.`);
    return [key, number];
  })) as AlgorithmWeights;
}

export function historyRelations(history: HistoryRound[]) {
  const partners = new Set<string>(), lastPartners = new Set<string>(), lastOpponents = new Set<string>();
  history.forEach((round, index) => round.matches.forEach(match => {
    for (const team of [match.team1, match.team2]) {
      if (team.length === 2) {
        const key = pairKey(team[0], team[1]);
        partners.add(key);
        if (index === 0) lastPartners.add(key);
      }
    }
    if (index === 0) for (const a of match.team1) for (const b of match.team2) lastOpponents.add(pairKey(a, b));
  }));
  return { partners, lastPartners, lastOpponents };
}

export function scoreMatch(match: ProposedMatch, input: OptimizerInput) {
  const byId = new Map(input.players.map(p => [p.id, p]));
  const a = match.team1.map(id => byId.get(id)!), b = match.team2.map(id => byId.get(id)!);
  const sum = (team: OptimizerPlayer[], key: 'cr' | 'age') => team.reduce((total, p) => total + (p[key] ?? 0), 0);
  const balanceDifference = Math.abs(sum(a, 'cr') - sum(b, 'cr'));
  const double = a.length === 2;
  const women = [...a, ...b].filter(p => p.gender === 'K').length;
  const mix = !double ? 5 : women === 2 ? 0 : women === 0 || women === 4 ? 1 : 2;
  const balanceAge = (double ? Math.abs((a[0].age ?? 0) - (a[1].age ?? 0)) + Math.abs((b[0].age ?? 0) - (b[1].age ?? 0)) : 0)
    + Math.abs(sum(a, 'age') - sum(b, 'age'));
  const relations = historyRelations(input.history);
  let sameTeamLastWeek = 0, sameTeam3Weeks = 0, opponentLastWeek = 0;
  for (const team of [a, b]) if (double) {
    const key = pairKey(team[0].id, team[1].id);
    sameTeamLastWeek += Number(relations.lastPartners.has(key));
    sameTeam3Weeks += Number(relations.partners.has(key));
  }
  for (const p of a) for (const q of b) opponentLastWeek += Number(relations.lastOpponents.has(pairKey(p.id, q.id)));
  const w = input.weights;
  const balanceSameTeamDifference = w.FactorSameTeamDifference * (double
    ? Math.abs(a[0].cr - a[1].cr) + Math.abs(b[0].cr - b[1].cr) : 0);
  const score = 100 - w.FactorMatchDifference * balanceDifference - w.FactorSameTeamLastWeek * sameTeamLastWeek
    - w.FactorSameTeam3Weeks * sameTeam3Weeks - w.FactorOpponentLastWeek * opponentLastWeek
    - w.FactorMix * mix - w.FactorAge * balanceAge - balanceSameTeamDifference;
  return { score, balanceDifference, balanceSameTeamDifference, balanceAge, mix, sameTeamLastWeek, sameTeam3Weeks, opponentLastWeek };
}

export function validateOptimizerInput(input: OptimizerInput) {
  parseAlgorithmWeights(input.weights);
  if (input.players.length > 200) throw new Error('Der kan højst beregnes for 200 spillere ad gangen.');
  const ids = new Set<number>(), members = new Set<string>();
  for (const p of input.players) {
    if (!Number.isSafeInteger(p.id) || ids.has(p.id) || members.has(p.memberNo)) throw new Error('Dubleret eller ugyldig spiller.');
    ids.add(p.id); members.add(p.memberNo);
    if (!Number.isInteger(p.cr) || p.cr < 1 || p.cr > 9) throw new Error(`Medlem ${p.memberNo} mangler en gyldig CR (1–9).`);
    if (!['M', 'K'].includes(p.gender)) throw new Error(`Medlem ${p.memberNo} mangler køn.`);
    if (!Number.isInteger(p.requestedHours) || p.requestedHours < 1 || p.requestedHours > 3) throw new Error('Ugyldigt timeønske.');
    if (!Number.isSafeInteger(p.signupOrder) || p.signupOrder < 1 || !['active', 'waitlist'].includes(p.status)) throw new Error('Ugyldig tilmeldingsrækkefølge eller status.');
    if (!Array.isArray(p.availability) || p.availability.some(t => !input.slots.some(s => s.startTime === t))) throw new Error('Ugyldige tilmeldingstider.');
    if (input.weights.FactorAge !== 0 && (!Number.isInteger(p.age) || p.age! < 0 || p.age! > 120))
      throw new Error('Alder kan ikke beregnes for alle spillere. Angiv fødselsår eller brug FactorAge = 0.');
  }
  for (const slot of input.slots) minutes(slot.startTime);
}

// Independent of CP-SAT: never trust a solver response or a client-submitted proposal.
export function validateProposal(raw: unknown, input: OptimizerInput): ProposedMatch[] {
  validateOptimizerInput(input);
  if (!Array.isArray(raw) || raw.length > input.slots.length) throw new Error('Ugyldigt antal kampe.');
  const people = new Map(input.players.map(p => [p.id, p]));
  const usage = new Map<number, number[]>(), courtUsage = new Map<number, number[]>();
  const result: ProposedMatch[] = [];
  for (const row of raw) {
    if (!row || !Array.isArray(row.team1) || !Array.isArray(row.team2) || ![1, 2].includes(row.team1.length) || row.team1.length !== row.team2.length)
      throw new Error('En kamp skal være to mod to eller én mod én.');
    if (!input.slots.some(s => s.court === row.court && s.startTime === row.startTime)) throw new Error('Banen er ikke til rådighed på dette tidspunkt.');
    const ids = [...row.team1, ...row.team2] as number[];
    if (new Set(ids).size !== ids.length || ids.some(id => !people.has(id))) throw new Error('En spiller mangler tilmelding eller optræder flere gange i samme kamp.');
    const players = ids.map(id => people.get(id)!);
    if (Math.max(...players.map(p => p.cr)) - Math.min(...players.map(p => p.cr)) > 3) throw new Error('CR-forskellen i en kamp er større end 3.');
    if (forbiddenMemberPairs.some(pair => pair.every(no => players.some(p => p.memberNo === no)))) throw new Error('Kampen indeholder en forbudt spillerkombination.');
    if (ids.length === 4 && players.filter(p => p.gender === 'K').length === 2 && people.get(row.team1[0])!.gender === people.get(row.team1[1])!.gender)
      throw new Error('Mixed double kræver én mand og én kvinde på hvert hold.');
    const start = minutes(row.startTime);
    const courtTimes = courtUsage.get(row.court) ?? [];
    if (courtTimes.some(t => Math.abs(t - start) < 60)) throw new Error('To kampe overlapper på samme bane.');
    courtUsage.set(row.court, [...courtTimes, start]);
    for (const p of players) {
      if (!p.availability.includes(row.startTime)) throw new Error(`Medlem ${p.memberNo} kan ikke spille på tidspunktet.`);
      const times = usage.get(p.id) ?? [];
      if (times.some(t => Math.abs(t - start) < 60)) throw new Error(`Medlem ${p.memberNo} har overlappende kampe.`);
      if (times.length >= p.requestedHours) throw new Error(`Medlem ${p.memberNo} får flere timer end ønsket.`);
      usage.set(p.id, [...times, start]);
    }
    result.push({ court: row.court, startTime: row.startTime, team1: [...row.team1], team2: [...row.team2] });
  }
  const key = (m: ProposedMatch) => `${m.court}/${m.startTime}/${[m.team1.slice().sort((a,b) => a-b).join(','), m.team2.slice().sort((a,b) => a-b).join(',')].sort().join('/')}`;
  for (const locked of input.locked) if (!result.some(m => key(m) === key(locked))) throw new Error('En låst kamp er ændret eller mangler.');
  return result.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.court - b.court);
}

export function proposalRows(matches: ProposedMatch[], names: Map<number, string>) {
  return matches.map(m => {
    const end = minutes(m.startTime) + 60;
    return { A: m.startTime, B: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, C: String(m.court),
      D: names.get(m.team1[0])!, E: m.team1.length === 2 ? names.get(m.team1[1])! : '',
      F: names.get(m.team2[0])!, G: m.team2.length === 2 ? names.get(m.team2[1])! : '' };
  });
}
