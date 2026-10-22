export type ForbiddenPair = [string, string];

export function parseForbiddenPairs(raw: unknown): ForbiddenPair[] {
  if (!Array.isArray(raw) || raw.length > 1000) throw new Error('Listen må højst indeholde 1000 spillerpar.');
  const seen = new Set<string>();
  return raw.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(n => typeof n !== 'string' || !n.trim()) || pair[0] === pair[1])
      throw new Error('Vælg to forskellige medlemmer i hvert par.');
    const sorted = [...pair].sort() as ForbiddenPair;
    const key = JSON.stringify(sorted);
    if (seen.has(key)) throw new Error('Det samme spillerpar er valgt flere gange.');
    seen.add(key);
    return sorted;
  });
}
