import {algorithmWeightDefaults, parseAlgorithmWeights, type AlgorithmWeights} from './optimizer.ts';

export const optimizerHelp: Record<keyof AlgorithmWeights, string> = {
  FactorMatchDifference: 'Fradrag for forskellen mellem de to holds samlede CR. Højere værdi foretrækker mere jævnbyrdige hold.',
  FactorSameTeamDifference: 'Fradrag for CR-forskellen mellem de to makkere på hvert hold. Gælder kun double. Værdien 0 slår fradraget fra.',
  FactorDistanceSameTeamA: 'Maksimal CR-forskel mellem makkere, når mindst én har CR 1–4. Vælg 2 eller 3. Dette er en fast regel, ikke et fradrag i score.',
  FactorSameTeamLastWeek: 'Fradrag for hvert makkerpar, der også spillede sammen i seneste afholdte runde.',
  FactorSameTeam3Weeks: 'Fradrag for hvert makkerpar, der spillede sammen i en af de seneste tre afholdte runder. Kan lægges oven i fradraget for seneste runde.',
  FactorOpponentLastWeek: 'Fradrag for hvert par modstandere, der også mødtes i seneste afholdte runde.',
  FactorMix: 'Fradrag: mixed double × 0, double med samme køn × 1, double med tre af samme køn × 2 og single × 5. Ved 50 giver en single −150 point før øvrige fradrag.',
  FactorAge: 'Fradrag for aldersforskelle mellem makkere og mellem holdenes samlede alder. Kræver fødselsår for alle spillere. Værdien 0 slår fradraget fra.',
};

export const weightFields = (weights: AlgorithmWeights = algorithmWeightDefaults): Record<string, string> =>
  Object.fromEntries(Object.entries(weights).map(([name, value]) => [name, String(value)]));

export function restoreWeights(raw: string | null): AlgorithmWeights {
  try { return parseAlgorithmWeights(JSON.parse(raw ?? '{}')); }
  catch { return {...algorithmWeightDefaults}; }
}
