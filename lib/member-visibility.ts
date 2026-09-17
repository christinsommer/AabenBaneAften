export function visibleMember<T extends {age?:number|null;pinHash:string;christinRanking:number|null;crReviewedAt?:string|null;adminLevel:unknown;role:string}>(member:T) {
  const {pinHash,age,christinRanking,crReviewedAt,adminLevel,...publicFields}=member;
  void pinHash;
  void age; // Legacy stored age is replaced by birthYear.
  return member.role === 'admin' ? {...publicFields,christinRanking,crReviewedAt,adminLevel} : publicFields;
}
