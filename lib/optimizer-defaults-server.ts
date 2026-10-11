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

export async function loadOptimizerResources() {
  const [stored]=await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id,1)).limit(1);
  return parseOptimizerResources((stored?JSON.parse(stored.weights).optimizerResources:undefined)??defaultOptimizerResources);
}
