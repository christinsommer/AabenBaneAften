import { getCloudflareContext } from '@opennextjs/cloudflare';
import { and, eq, sql } from 'drizzle-orm';
import { currentPlayer } from '../../../lib/auth';
import { getDb } from '../../../db';
import { events, matches, feedback, substitutions } from '../../../db/schema';
import { loadOptimizerInput, optimizerRevisionSql } from '../../../lib/optimizer-server';
import { proposalRows, scoreMatch, validateProposal } from '../../../lib/optimizer';
import {normalizeKampplanRows} from '../../../lib/kampplan-rows';
import {reviewPlan} from '../../../lib/plan-review';

export async function POST(request: Request) {
  try {
    const user = await currentPlayer();
    if (!user) return Response.json({error: 'Log ind først.'}, {status: 401});
    if (user.role !== 'admin') return Response.json({error: 'Kun administratorer kan foreslå kampe.'}, {status: 403});
    const body = await request.json() as {action: string; eventId: number; weights: unknown; fingerprint?: string; matches?: unknown} | null;
    if (!body || !['solve', 'save', 'save_edit', 'edit_context', 'review_edit'].includes(body.action) || !Number.isSafeInteger(body.eventId)) return Response.json({error: 'Ugyldig anmodning.'}, {status: 400});
    const loaded = await loadOptimizerInput(body.eventId, body.weights);
    const {input, names} = loaded;
    if (body.action === 'edit_context') {
      const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
      const resolve = (name: string) => {
        const ids = [...names].filter(([, value]) => normalize(value) === normalize(name)).map(([id]) => id);
        if (ids.length !== 1 || !input.players.some(p => p.id === ids[0])) throw new Error(`“${name}” kan ikke knyttes entydigt til en tilmeldt spiller.`);
        return ids[0];
      };
      const rows = normalizeKampplanRows(JSON.parse(loaded.event.importedKampplan || '[]'));
      if (!rows.length) throw new Error('Der er ingen kampplan at redigere.');
      const plan = rows.map(row => ({court: Number(row.C.replace(/\D/g, '')), startTime: row.A.replace('.', ':'),
        team1: [row.D, row.E].filter(Boolean).map(resolve), team2: [row.F, row.G].filter(Boolean).map(resolve)}));
      return Response.json({matches: plan, players: input.players.map(p => ({id:p.id, name:names.get(p.id)})), locked: input.locked,
        weights: input.weights, fingerprint: loaded.fingerprint, ...reviewPlan(plan, input)});
    }
    if (body.action === 'review_edit') {
      if (body.fingerprint !== loaded.fingerprint) return Response.json({error: 'Tilmeldinger, medlemmer eller kampplan er ændret. Annuller redigeringen og indlæs den nyeste plan.'}, {status:409});
      return Response.json(reviewPlan(body.matches as Parameters<typeof reviewPlan>[0], input));
    }
    if (body.action === 'save' || body.action === 'save_edit') {
      if (body.fingerprint !== loaded.fingerprint) return Response.json({error: 'Tilmeldinger, medlemmer eller kampplan er ændret. Lav et nyt forslag.'}, {status: 409});
      const plan = validateProposal(body.matches, input, {manualEdit: body.action === 'save_edit'});
      const exceptions = body.action === 'save_edit' ? reviewPlan(plan, input).exceptions : [];
      if (!plan.length) return Response.json({error: 'Et tomt forslag kan ikke gemmes.'}, {status: 400});
      const rows = proposalRows(plan, names).map((row, index) => ({...row, _optimizerScore: scoreMatch(plan[index], input).score,
        _manualDistanceNames: exceptions.filter(issue => issue.matchIndex === index).flatMap(issue => issue.playerIds.map(id => names.get(id))),
        ...(index === 0 ? {_optimizerRevision: crypto.randomUUID(), _optimizerWeights: input.weights} : {}),
      }));
      const serialized = JSON.stringify(rows);
      const db = getDb();
      const savedGuard = sql`EXISTS (SELECT 1 FROM events WHERE id = ${body.eventId} AND imported_kampplan = ${serialized})`;
      // D1 batch is atomic. A unique marker makes every subsequent write conditional on the first update succeeding.
      const queries = [
        db.update(events).set({importedKampplan: serialized}).where(and(eq(events.id, body.eventId), sql`${optimizerRevisionSql(body.eventId)} = ${loaded.revision}`)).returning({id: events.id}).toSQL(),
        db.delete(feedback).where(and(savedGuard, sql`${feedback.matchId} IN (SELECT id FROM matches WHERE event_id = ${body.eventId} AND locked = 0)`)).toSQL(),
        db.delete(substitutions).where(and(savedGuard, sql`${substitutions.matchId} IN (SELECT id FROM matches WHERE event_id = ${body.eventId} AND locked = 0)`)).toSQL(),
        db.delete(matches).where(and(eq(matches.eventId, body.eventId), eq(matches.locked, false), savedGuard)).toSQL(),
        ...plan.filter(m => !input.locked.some(l => l.court === m.court && l.startTime === m.startTime)).map(m => ({
          sql: 'INSERT INTO matches (event_id,court,start_time,player_ids,locked) SELECT ?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM events WHERE id=? AND imported_kampplan=?)',
          params: [body.eventId, m.court, m.startTime, JSON.stringify([...m.team1, ...m.team2]), body.eventId, serialized],
        })),
      ];
      const d1 = getCloudflareContext().env.DB;
      const result = await d1.batch(queries.map(q => d1.prepare(q.sql).bind(...q.params)));
      if (!result[0].results.length) return Response.json({error: 'Data blev ændret, før forslaget kunne gemmes. Lav et nyt forslag.'}, {status: 409});
      return Response.json({ok: true});
    }
    if (!input.players.length) return Response.json({error: 'Der er ingen tilmeldte spillere at lave kampe for.'}, {status: 400});
    const env = getCloudflareContext().env as CloudflareEnv & {OPTIMIZER_URL?: string; OPTIMIZER_API_KEY?: string};
    if (!env.OPTIMIZER_URL || !env.OPTIMIZER_API_KEY) return Response.json({error: 'Beregningstjenesten er ikke tilsluttet i dette miljø.'}, {status: 503});
    const url = new URL('/solve', env.OPTIMIZER_URL);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Beregningstjenesten skal bruge HTTPS.');
    let response: Response;
    try { response = await fetch(url, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.OPTIMIZER_API_KEY}`},
      body: JSON.stringify(input), signal: AbortSignal.any([request.signal, AbortSignal.timeout(160_000)]),
    }); } catch (error) {
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      return Response.json({error: timeout
        ? 'Beregningstjenesten svarede ikke inden tidsgrænsen. Prøv igen.'
        : ['localhost', '127.0.0.1'].includes(url.hostname)
          ? 'Den lokale beregningstjeneste kan ikke kontaktes. Start den med npm run optimizer:start, og prøv igen.'
          : 'Beregningstjenesten kan ikke kontaktes. Prøv igen om lidt.'}, {status: timeout ? 504 : 503});
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as {error?: string};
      return Response.json({error: failure.error || 'Beregningstjenesten kunne ikke lave forslaget.'}, {status: 502});
    }
    const result = await response.json() as {matches: unknown; status: string; score: number; stages: unknown[]};
    if (!['OPTIMAL', 'FEASIBLE'].includes(result.status)) throw new Error('Beregningstjenesten returnerede ingen gyldig løsning.');
    const plan = validateProposal(result.matches, input);
    const scores = plan.map(m => scoreMatch(m, input));
    const score = scores.reduce((sum, s) => sum + s.score, 0);
    if (result.score !== score) throw new Error('Kontrol af kampscore fejlede. Forslaget blev afvist.');
    const reloaded = await loadOptimizerInput(body.eventId, input.weights);
    if (reloaded.fingerprint !== loaded.fingerprint) return Response.json({error: 'Data blev ændret under beregningen. Lav et nyt forslag.'}, {status: 409});
    return Response.json({matches: plan, rows: proposalRows(plan, names), scores, score, status: result.status,
      stages: result.stages, fingerprint: loaded.fingerprint, weights: input.weights, historyDates: input.history.map(r => r.date),
      allocation: input.players.map(p => ({id: p.id, name: names.get(p.id), memberNo: p.memberNo, status: p.status, signupOrder: p.signupOrder,
        requested: p.requestedHours, assigned: plan.filter(m => [...m.team1, ...m.team2].includes(p.id)).length})),
    });
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : 'Kampforslaget kunne ikke beregnes.'}, {status: 400});
  }
}
