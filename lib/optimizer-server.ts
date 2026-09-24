import { and, asc, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { events, matches, players, signups } from '../db/schema';
import {loadOptimizerDefaults} from './optimizer-defaults-server';
import { COURTS, ensureEvent } from './schedule';
import { registrationIsOpen } from './registration';
import { copenhagenDate } from './calendar';
import {ageFromBirthYear, currentYear} from './birth-year';
import { normalizeKampplanRows } from './kampplan-rows';
import { HISTORY_START, parseAlgorithmWeights, validateOptimizerInput, validateProposal, type HistoryRound, type OptimizerInput, type ProposedMatch } from './optimizer';

// No credentials in the snapshot. The same SQL is used in the atomic save condition.
export function optimizerRevisionSql(eventId: number) {
  return sql`json_array(
    (SELECT json_group_array(json_array(id,date,status,registration_opens_at,registration_closes_at,registration_override,imported_kampplan,is_test,test_active,archived)) FROM (SELECT * FROM events ORDER BY id)),
    (SELECT json_group_array(json_array(id,member_no,name,christin_ranking,birth_year,gender,spouse_no,spouse_mode,suspended_event_id)) FROM (SELECT * FROM players ORDER BY id)),
    (SELECT json_group_array(json_array(id,player_id,availability,requested_hours,signup_order,status)) FROM (SELECT * FROM signups WHERE event_id = ${eventId} ORDER BY id)),
    (SELECT json_group_array(json_array(id,event_id,court,start_time,player_ids,locked)) FROM (SELECT * FROM matches ORDER BY id))
  )`;
}

export async function loadOptimizerInput(eventId: number, weights: unknown, forScoring = false) {
  const db = getDb();
  const revisionRows = await db.all<{revision: string}>(sql`SELECT ${optimizerRevisionSql(eventId)} AS revision`);
  const revision = revisionRows[0].revision;
  const event = await ensureEvent();
  if (!event || event.id !== eventId) throw new Error('Spillerunden er ændret. Genindlæs siden.');
  if (!forScoring && event.status !== 'draft') throw new Error('Der kan kun foreslås kampe for en kladde.');
  if (!forScoring && (registrationIsOpen(event) || event.registrationOverride === 'auto' && new Date() < new Date(event.registrationClosesAt)))
    throw new Error('Luk tilmeldingen, før der foreslås kampe.');
  const now = new Date();
  const members = await db.select({id: players.id, memberNo: players.memberNo, name: players.name, cr: players.christinRanking, spouseNo: players.spouseNo, spouseMode: players.spouseMode, birthYear: players.birthYear, gender: players.gender, suspendedEventId: players.suspendedEventId}).from(players).orderBy(asc(players.id));
  const registrations = await db.select().from(signups).where(and(eq(signups.eventId, event.id), ne(signups.status, 'cancelled'))).orderBy(asc(signups.signupOrder), asc(signups.id));
  const existing = await db.select().from(matches).where(eq(matches.eventId, event.id));
  const people = new Map(members.map(p => [p.id, p]));
  const nativeMatch = (m: typeof matches.$inferSelect): ProposedMatch => {
    const ids = JSON.parse(m.playerIds) as number[];
    if (![2, 4].includes(ids.length)) throw new Error('En tidligere eller låst kamp har et ugyldigt antal spillere.');
    return {court: m.court, startTime: m.startTime, team1: ids.slice(0, ids.length / 2), team2: ids.slice(ids.length / 2)};
  };
  const previous = await db.select().from(events).where(and(
    gte(events.date, HISTORY_START), lt(events.date, event.date), lt(events.date, copenhagenDate()), eq(events.status, 'published'), eq(events.isTest, false),
  )).orderBy(desc(events.date));
  const history: HistoryRound[] = [];
  const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
  const resolve = (name: string) => {
    const found = members.filter(p => normalize(p.name) === normalize(name));
    if (found.length !== 1) throw new Error(`Navnet “${name}” i kamphistorikken kan ikke knyttes entydigt til et medlem. Ret historikken, før algoritmen bruges.`);
    return found[0].id;
  };
  for (const round of previous) {
    const stored = await db.select().from(matches).where(eq(matches.eventId, round.id)).orderBy(asc(matches.startTime), asc(matches.court));
    const imported = round.importedKampplan ? normalizeKampplanRows(JSON.parse(round.importedKampplan)) : [];
    // New algorithm plans carry stable IDs in the stored native matches; old Excel plans use names.
    const isAlgorithmPlan = round.importedKampplan && (JSON.parse(round.importedKampplan)[0]?._optimizerRevision);
    const games = isAlgorithmPlan || !imported.length ? stored.map(nativeMatch) : imported.map(row => ({
      team1: [row.D, row.E].filter(Boolean).map(resolve), team2: [row.F, row.G].filter(Boolean).map(resolve),
    }));
    if (!games.length) continue;
    history.push({date: round.date, matches: games});
    if (history.length === 3) break;
  }
  const input: OptimizerInput = {
    players: registrations.filter(s => s.requestedHours > 0 && people.get(s.playerId)?.suspendedEventId !== event.id).map(s => {
      const p = people.get(s.playerId);
      if (!p) throw new Error('En tilmeldt spiller findes ikke længere.');
      return {id: p.id, memberNo: p.memberNo, spouseNo: p.spouseNo, spouseMode: p.spouseMode, cr: p.cr!, age: ageFromBirthYear(p.birthYear, now), gender: p.gender, availability: JSON.parse(s.availability), requestedHours: s.requestedHours, signupOrder: s.signupOrder!, status: s.status as 'active' | 'waitlist'};
    }),
    slots: Object.entries(COURTS).flatMap(([startTime, courts]) => courts.map(court => ({startTime, court}))),
    locked: existing.filter(m => m.locked).map(nativeMatch), history, weights: parseAlgorithmWeights({...await loadOptimizerDefaults(), ...(weights as Record<string, unknown> ?? {})}),
  };
  validateOptimizerInput(input);
  if (!forScoring) validateProposal(input.locked, input, {partial: true});
  const after = await db.all<{revision: string}>(sql`SELECT ${optimizerRevisionSql(eventId)} AS revision`);
  if (after[0].revision !== revision) throw new Error('Data blev ændret under indlæsningen. Prøv igen.');
  const fingerprintBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({revision, weights: input.weights, year: currentYear(now)})));
  const fingerprint = Array.from(new Uint8Array(fingerprintBytes), b => b.toString(16).padStart(2, '0')).join('');
  return {input, fingerprint, revision, names: new Map(members.map(p => [p.id, p.name])), event};
}
