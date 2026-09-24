import {eq} from 'drizzle-orm';
import {getDb} from '../db';
import {optimizerDefaults} from '../db/schema';
import {parseAlgorithmWeights} from './optimizer';

export async function loadOptimizerDefaults() {
  const [stored] = await getDb().select().from(optimizerDefaults).where(eq(optimizerDefaults.id, 1)).limit(1);
  return parseAlgorithmWeights(stored ? JSON.parse(stored.weights) : {});
}
