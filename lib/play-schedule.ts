import type {CourtOrder} from './court-order';

export const defaultPlayTimes = {whole:['18:00','19:00','20:00','21:00'],half:['18:30','19:30','20:30']};
export type PlayTimes = typeof defaultPlayTimes;

export function parsePlayTimes(raw: unknown): PlayTimes {
  if (!raw || typeof raw!=='object') throw new Error('Spilletiderne mangler.');
  const result={} as PlayTimes;
  for (const key of ['whole','half'] as const) {
    const value=(raw as Record<string,unknown>)[key];
    const times=typeof value==='string' ? (value.trim()?value.split(',').map(s=>s.trim()):[]) : value;
    const pattern=key==='whole'?/^([01]\d|2[0-3]):00$/:/^([01]\d|2[0-3]):30$/;
    if (!Array.isArray(times)||times.some(t=>typeof t!=='string'||!pattern.test(t))||new Set(times).size!==times.length)
      throw new Error(`${key==='whole'?'Hele timer tider':'Halve timer tider'} skal være forskellige tider i formatet ${key==='whole'?'18:00':'18:30'}, adskilt med komma.`);
    result[key]=[...times].sort();
  }
  if (!result.whole.length&&!result.half.length) throw new Error('Angiv mindst én starttid.');
  return result;
}

export function buildPlaySchedule(courtOrder:CourtOrder,playTimes:PlayTimes) {
  const timeGroups={whole:courtOrder.whole.length?playTimes.whole:[],half:courtOrder.half.length?playTimes.half:[]};
  const slots=(['whole','half'] as const).flatMap(key=>timeGroups[key].flatMap(startTime=>courtOrder[key].map(court=>({startTime,court}))));
  if (!slots.length) throw new Error('Angiv både baner og starttider for mindst én gruppe.');
  if (slots.length>32) throw new Error('Der kan højst være 32 kombinationer af bane og starttid.');
  return {courtOrder,playTimes,timeGroups,times:[...timeGroups.whole,...timeGroups.half].sort(),slots};
}

export function playTimeLabel(time:string) {
  const [h,m]=time.split(':').map(Number);
  return `${time}–${String((h+1)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
