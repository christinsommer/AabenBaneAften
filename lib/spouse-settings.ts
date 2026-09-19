export function spouseSettings(body: Record<string, unknown>, current: {spouseNo: number | null; spouseMode: number | null}, memberNo: string, members: {memberNo: string}[]) {
  const spouseNo = body.spouseNo === undefined ? current.spouseNo : body.spouseNo;
  const spouseMode = body.spouseMode === undefined ? current.spouseMode : body.spouseMode;
  if (spouseNo === null && spouseMode === null) return {spouseNo, spouseMode};
  if (typeof spouseNo !== 'number' || !Number.isSafeInteger(spouseNo) || spouseNo <= 0 || ![1,2].includes(spouseMode as number))
    throw new Error('Vælg både Spouse No. og en spillebetingelse, eller fjern begge.');
  if (Number(memberNo) === spouseNo) throw new Error('Et medlem kan ikke vælge sig selv som partner.');
  if (members.filter(p => Number(p.memberNo) === spouseNo).length !== 1)
    throw new Error('Partnerens medlemsnummer skal findes entydigt blandt medlemmerne.');
  return {spouseNo, spouseMode: spouseMode as number};
}
