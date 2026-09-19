// Include starts between consecutive selected one-hour slots, without bridging gaps.
export function includeIntermediateTimes(selected: readonly string[], times: readonly string[]): string[] {
  const minutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  const starts = [...new Set(selected)].map(minutes).sort((a, b) => a - b);
  return times.filter(time => {
    const start = minutes(time);
    return starts.includes(start) || starts.some((left, index) => {
      const right = starts[index + 1];
      return right !== undefined && right - left <= 60 && start > left && start < right;
    });
  }).sort();
}

export type SignupInput = {
  nHours: 0 | 1 | 2 | 3;
  nPossible: number;
  szPossible: string[];
};

export function signupSelectionError(selected: readonly string[], hours: number): string | null {
  if (hours === 0) return null;
  const starts = [...new Set(selected)].map(time => {
    const [h,m] = time.split(':').map(Number);
    return h * 60 + m;
  }).sort((a,b) => a-b);
  if (starts.length < 2) return 'Du skal vælge mindst 2 tider, også selvom du kun ønsker 1 time.';
  let count = 0, nextStart = -Infinity;
  for (const start of starts) if (start >= nextStart) { count++; nextStart = start + 60; }
  return count < hours ? `Du ønsker ${hours} timer. Vælg mindst ${hours} tider, som ikke overlapper. Hver kamp varer 1 time.` : null;
}

export function signupInput(body: Record<string, unknown>, times: readonly string[]): SignupInput {
  // Accept the previous field names while already-open clients update.
  const nHours = body.nHours ?? body.requestedHours;
  const szPossible = body.szPossible ?? body.availability;
  const canonical = 'nHours' in body || 'szPossible' in body || 'nPossible' in body;
  const nPossible = canonical ? body.nPossible : (Array.isArray(szPossible) ? szPossible.length : undefined);
  if (typeof nHours !== 'number' || !Number.isInteger(nHours) || nHours < 0 || nHours > 3)
    throw new Error('Antal timer skal være et heltal fra 0 til 3.');
  if (!Array.isArray(szPossible) || szPossible.some(time => typeof time !== 'string' || !times.includes(time)))
    throw new Error('Vælg gyldige starttidspunkter.');
  if (typeof nPossible !== 'number' || !Number.isInteger(nPossible) || nPossible !== szPossible.length)
    throw new Error('Antal mulige tidspunkter skal svare til listen af tider.');
  if (new Set(szPossible).size !== szPossible.length)
    throw new Error('Et starttidspunkt må kun vælges én gang.');
  const selectionError = signupSelectionError(szPossible, nHours);
  if (selectionError) throw new Error(selectionError);
  return {nHours:nHours as SignupInput['nHours'],nPossible,szPossible:[...szPossible].sort()};
}

export function signupFields(row?: {requestedHours:number;availability:string;status?:string} | null) {
  if (!row || row.status === 'cancelled') return {nHours:0,nPossible:0,szPossible:[] as string[]};
  const szPossible: string[] = JSON.parse(row.availability);
  return {nHours:row.requestedHours,nPossible:szPossible.length,szPossible};
}

export function noSignup(eventId:number,playerId:number) {
  return {id:null,eventId,playerId,signupOrder:null,status:'not_registered',requestedHours:0,availability:'[]',...signupFields(null)};
}
