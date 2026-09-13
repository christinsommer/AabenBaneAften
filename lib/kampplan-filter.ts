export function isPlayersImportedMatch(row: Record<string, unknown>, playerName: string) {
  const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
  const name = normalize(playerName);
  return !!name && ['D', 'E', 'F', 'G'].some(key => normalize(row[key]) === name);
}
