import {spouseTogether, forbiddenMemberPairs, minutes, scoreMatch, validateOptimizerInput, validateProposal, type OptimizerInput, type ProposedMatch} from './optimizer.ts';

export type PlanIssue = {matchIndex: number; playerIds: number[]; message: string};
export function reviewPlan(plan: ProposedMatch[], input: OptimizerInput) {
  validateOptimizerInput(input);
  if (!Array.isArray(plan) || !plan.length || plan.length > input.slots.length || plan.some(m =>
    !m || !Array.isArray(m.team1) || !Array.isArray(m.team2) || m.team1.length > 2 || m.team2.length > 2 ||
    [...m.team1, ...m.team2].some(id => !Number.isSafeInteger(id)))) throw new Error('Ugyldig kampplan.');
  const people = new Map(input.players.map(p => [p.id, p]));
  const issues: PlanIssue[] = [];
  const exceptions: PlanIssue[] = [];
  const add = (matchIndex: number, playerIds: number[], message: string) => {
    const unique = [...new Set(playerIds)];
    if (!issues.some(i => i.matchIndex === matchIndex && i.message === message && i.playerIds.join() === unique.join()))
      issues.push({matchIndex, playerIds: unique, message});
  };
  const appearances = new Map<number, {index: number; start: number}[]>();
  const partnerMatches = new Map<string, number>();
  const scores = plan.map((m, index) => {
    const ids = [...m.team1, ...m.team2];
    const start = minutes(m.startTime);
    if (!input.slots.some(s => s.court === m.court && s.startTime === m.startTime)) add(index, ids, 'Banen er ikke reserveret på dette tidspunkt.');
    const complete = m.team1.length === m.team2.length && [1, 2].includes(m.team1.length);
    if (!complete) add(index, ids, 'Kampen skal være to mod to eller én mod én.');
    if (complete && ids.length === 2 && start < minutes('20:30')) add(index, ids, 'Single er først tilladt fra kl. 20.30.');
    for (const id of new Set(ids)) {
      const p = people.get(id);
      if (!p) { add(index, [id], 'Spilleren har ikke en gyldig tilmelding.'); continue; }
      if (ids.filter(other => other === id).length > 1) add(index, [id], 'Spilleren optræder flere gange i samme kamp.');
      if (!p.availability.includes(m.startTime)) add(index, [id], 'Spilleren har ikke valgt dette tidspunkt.');
      const uses = appearances.get(id) ?? [];
      uses.push({index, start}); appearances.set(id, uses);
    }
    const players = ids.map(id => people.get(id));
    if (players.some(p => !p)) return null;
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const p = people.get(ids[a])!, q = people.get(ids[b])!;
      if (!spouseTogether(p,q) && Math.abs(p.cr - q.cr) > 3) add(index, [p.id, q.id], 'CR-forskellen i kampen må højst være 3.');
      if (forbiddenMemberPairs.some(pair => pair.includes(p.memberNo) && pair.includes(q.memberNo) && p.id !== q.id))
        add(index, [p.id, q.id], 'Spillerne må ikke være i samme kamp.');
    }
    for (const team of [m.team1, m.team2]) if (team.length === 2) {
      const [a, b] = team.map(id => people.get(id)!);
      const pair = [a.id,b.id].sort((x,y)=>x-y).join(':');
      const previous = partnerMatches.get(pair);
      if (!spouseTogether(a,b) && previous !== undefined) {
        const message = 'Samme makker må kun bruges én gang i kampplanen.';
        add(previous,[a.id,b.id],message);
        add(index,[a.id,b.id],message);
      }
      partnerMatches.set(pair,index);
      if (!spouseTogether(a,b) && Math.min(a.cr, b.cr) <= 4 && Math.abs(a.cr - b.cr) > input.weights.FactorDistanceSameTeamA)
        exceptions.push({matchIndex: index, playerIds: team, message: 'CR-forskellen mellem makkere overskrider FactorDistanceSameTeamA. Tilladt ved manuel redigering.'});
    }
    if (complete && ids.length === 4 && players.filter(p => p!.gender === 'K').length === 2 &&
      people.get(m.team1[0])!.gender === people.get(m.team1[1])!.gender)
      add(index, ids, 'Mixed double skal have én mand og én kvinde på hvert hold.');
    return complete ? scoreMatch(m, input).score : null;
  });
  for (const [id, uses] of appearances) {
    if (uses.length > people.get(id)!.requestedHours) for (const use of uses) add(use.index, [id], 'Spilleren får flere timer end ønsket.');
    for (let a = 0; a < uses.length; a++) for (let b = a + 1; b < uses.length; b++) {
      if (Math.abs(uses[a].start - uses[b].start) < 60) {
        add(uses[a].index, [id], 'Spilleren har overlappende kampe.');
        add(uses[b].index, [id], 'Spilleren har overlappende kampe.');
      }
    }
  }
  for (let a = 0; a < plan.length; a++) for (let b = a + 1; b < plan.length; b++) {
    if (plan[a].court === plan[b].court && Math.abs(minutes(plan[a].startTime) - minutes(plan[b].startTime)) < 60)
      for (const index of [a, b]) add(index, [...plan[index].team1, ...plan[index].team2], 'To kampe overlapper på samme bane.');
  }
  const key = (m: ProposedMatch) => JSON.stringify([m.court, m.startTime, [m.team1.slice().sort((a,b)=>a-b), m.team2.slice().sort((a,b)=>a-b)].sort()]);
  for (const locked of input.locked) if (!plan.some(m => key(m) === key(locked))) {
    const index = plan.findIndex(m => m.court === locked.court && m.startTime === locked.startTime);
    add(index, index < 0 ? [] : [...plan[index].team1, ...plan[index].team2], 'En låst kamp er ændret eller mangler.');
  }
  // The save validator remains the final authority if a rule is added in the future.
  if (!issues.length) {
    try { validateProposal(plan, input, {manualEdit: true}); }
    catch (error) { add(-1, [], error instanceof Error ? error.message : 'Kampplanen er ugyldig.'); }
  }
  return {valid: issues.length === 0, issues, exceptions, scores};
}

export type PlayerSlot = {match: number; team: 0 | 1; slot: 0 | 1};
export type EditableMatch = {court: number; startTime: string; teams: [(number | null)[], (number | null)[]]};
export const editableMatches = (plan: ProposedMatch[]): EditableMatch[] => plan.map(m => ({court:m.court, startTime:m.startTime,
  teams:[[m.team1[0] ?? null, m.team1[1] ?? null], [m.team2[0] ?? null, m.team2[1] ?? null]]}));
export const proposedMatches = (plan: EditableMatch[]): ProposedMatch[] => plan.map(m => ({court:m.court, startTime:m.startTime,
  team1:m.teams[0].filter((id): id is number => id !== null), team2:m.teams[1].filter((id): id is number => id !== null)}));
export function swapPlayerSlots(plan: EditableMatch[], from: PlayerSlot, to: PlayerSlot): EditableMatch[] {
  const copy = structuredClone(plan);
  const source = copy[from.match]?.teams[from.team], target = copy[to.match]?.teams[to.team];
  if (!source || !target || ![0,1].includes(from.slot) || ![0,1].includes(to.slot)) throw new Error('Ugyldig spillerplacering.');
  [source[from.slot], target[to.slot]] = [target[to.slot], source[from.slot]];
  return copy;
}
