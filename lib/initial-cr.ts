import type { SelfLevel } from './ranking';

// Server-only usage: never include this initial administrator assessment in member responses.
export const INITIAL_CR: Record<SelfLevel,number> = {
  A:2,'A-':3,AB:4,B:5,'B+':4,'B-':6,BC:7,'C+':7,C:8,'C-':9,
};

export function initialCr(value:string):number|null {
  const normalized=value.trim().toUpperCase();
  if(Object.hasOwn(INITIAL_CR,normalized))return INITIAL_CR[normalized as SelfLevel];
  if(normalized.includes('A'))return 4;
  if(normalized.includes('B'))return 6;
  if(normalized.includes('C'))return 8;
  return null;
}
