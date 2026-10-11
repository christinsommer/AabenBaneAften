export const defaultOptimizerResources = {cpu:4,seconds:600};
export type OptimizerResources = typeof defaultOptimizerResources;

export function parseOptimizerResources(value:unknown):OptimizerResources {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Angiv CPU og tid for optimeringen.');
  const raw=value as Record<string,unknown>;
  const cpu=Number(raw.cpu),seconds=Number(raw.seconds);
  if(!['string','number'].includes(typeof raw.cpu)||!Number.isInteger(cpu)||cpu<1||cpu>32)throw new Error('CPU skal være et heltal fra 1 til 32.');
  if(!['string','number'].includes(typeof raw.seconds)||!Number.isInteger(seconds)||seconds<1||seconds>900)throw new Error('Tid skal være et heltal fra 1 til 900 sekunder.');
  return {cpu,seconds};
}
