import type {OptimizerInput, ProposedMatch} from './optimizer';

export const defaultCourtOrder = {whole: [4,3,2,1], half: [5,6,7]};
export type CourtOrder = typeof defaultCourtOrder;

export function parseCourtOrder(raw: unknown): CourtOrder {
  if (!raw || typeof raw !== 'object') throw new Error('Banerækkefølgerne mangler.');
  const result = {} as CourtOrder;
  for (const key of ['whole','half'] as const) {
    const value = (raw as Record<string, unknown>)[key];
    const order = typeof value === 'string' ? (value.trim() ? value.split(',').map(s=>Number(s.trim())) : []) : value;
    if (!Array.isArray(order) || new Set(order).size !== order.length || order.some(n=>!Number.isSafeInteger(n) || n<=0))
      throw new Error(`${key === 'whole' ? 'Hele timer rækkefølge' : 'Halve timer rækkefølge'} skal være forskellige positive banenumre, adskilt med komma.`);
    result[key] = [...order];
  }
  if (!result.whole.length && !result.half.length) throw new Error('Angiv mindst én bane.');
  return result;
}

// Courts within each start time are interchangeable. Assign after solving so
// preference is guaranteed even when the solver stops before optimality.
export function applyCourtOrder(plan: ProposedMatch[], input: Pick<OptimizerInput,'slots'|'locked'>, order: CourtOrder): ProposedMatch[] {
  // Shared courts can overlap across whole/half starts. In that case the solver
  // handles priorities globally; independently moving matches would cause clashes.
  if (order.whole.some(court=>order.half.includes(court))) return plan.map(m=>({...m}));
  const result = plan.map(m=>({...m}));
  for (const time of new Set(plan.map(m=>m.startTime))) {
    const locked = input.locked.filter(m=>m.startTime===time).map(m=>m.court);
    const available = order[time.endsWith(':00') ? 'whole' : 'half'].filter(court=>
      !locked.includes(court) && input.slots.some(s=>s.startTime===time && s.court===court));
    const movable = result.filter(m=>m.startTime===time && !locked.includes(m.court)).sort((a,b)=>a.court-b.court);
    if (movable.length > available.length) throw new Error('Der er ikke baner nok til den valgte rækkefølge.');
    movable.forEach((m,i)=>{m.court=available[i];});
  }
  return result;
}
