export const SELF_LEVELS = ['A','A-','AB','B+','B','B-','BC','C+','C','C-'] as const;
export type SelfLevel = typeof SELF_LEVELS[number];

export function isSelfLevel(value: unknown): value is SelfLevel {
  return typeof value === 'string' && SELF_LEVELS.some(level=>level===value);
}

// Compatibility with the existing four-category match/substitute algorithm.
export const LEVEL_SCORE: Record<string,number> = {
  A:4,'A-':4,AB:3,'B+':3,B:2,'B-':2,BC:1,'C+':1,C:1,'C-':1,
};

export function levelScore(value:string):number {
  const normalized=value.trim().toUpperCase();
  if(Object.hasOwn(LEVEL_SCORE,normalized))return LEVEL_SCORE[normalized];
  if(normalized.includes('A'))return 3;
  if(normalized.includes('B'))return 2;
  if(normalized.includes('C'))return 1;
  return NaN;
}
