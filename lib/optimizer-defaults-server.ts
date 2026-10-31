import {parseForbiddenPairs} from './forbidden-pairs';
import {defaultOptimizerPriorities,parseOptimizerPriorities} from './optimizer-priorities';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {eq} from 'drizzle-orm';
import {defaultOptimizerResources,parseOptimizerResources} from './optimizer-resources';
import {getDb} from '../db';
import {optimizerDefaults} from '../db/schema';
import {parseAlgorithmWeights} from './optimizer';
import {defaultCourtOrder, parseCourtOrder} from './court-order';
import {defaultPlayTimes, parsePlayTimes, buildPlaySchedule} from './play-schedule';

export async function loadPlaySchedule() {
  const [stored] = await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id, 1)).limit(1);
  const settings = stored ? JSON.parse(stored.weights) : {};
  return buildPlaySchedule(parseCourtOrder(settings.courtOrder ?? defaultCourtOrder),parsePlayTimes(settings.playTimes ?? defaultPlayTimes));
}

export async function loadCourtOrder() {
  const [stored] = await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id, 1)).limit(1);
  return parseCourtOrder((stored ? JSON.parse(stored.weights).courtOrder : undefined) ?? defaultCourtOrder);
}

export async function loadOptimizerDefaults() {
  const [stored] = await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id, 1)).limit(1);
  return parseAlgorithmWeights(stored ? JSON.parse(stored.weights) : {});
}

export async function loadEventOptimizerWeights(eventId:number) {
  const [stored] = await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id, 1)).limit(1);
  const settings = stored ? JSON.parse(stored.weights) : {};
  return parseAlgorithmWeights(settings.eventOptimizerWeights?.[String(eventId)] ?? settings);
}

export async function loadOptimizerResources() {
  const [stored]=await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id,1)).limit(1);
  return parseOptimizerResources((stored?JSON.parse(stored.weights).optimizerResources:undefined)??defaultOptimizerResources);
}

export async function loadOptimizerPriorities() {
  const [stored]=await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id,1)).limit(1);
  return parseOptimizerPriorities((stored?JSON.parse(stored.weights).optimizerPriorities:undefined)??defaultOptimizerPriorities);
}

export async function loadForbiddenPairs() {
 const {DB} = getCloudflareContext().env;
 const {results} = await DB.prepare('SELECT member_a, member_b FROM forbidden_pairs ORDER BY member_a, member_b').all<{member_a:string;member_b:string}>();
 return parseForbiddenPairs(results.map(row=>[row.member_a,row.member_b]));
}

export async function saveForbiddenPairs(pairs: [string,string][]) {
 const {DB} = getCloudflareContext().env;
 await DB.batch([
   DB.prepare('DELETE FROM forbidden_pairs'),
   ...pairs.map(([a,b])=>DB.prepare('INSERT INTO forbidden_pairs(member_a,member_b) VALUES(?,?)').bind(a,b)),
 ]);
}
