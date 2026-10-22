export function visibleMember<T extends {spouseNo?:number|null;spouseMode?:number|null;age?:number|null;pinHash:string;christinRanking:number|null;crReviewedAt?:string|null;adminLevel:unknown;role:string}>(member:T) {
  const {pinHash,age,spouseNo,spouseMode,christinRanking,crReviewedAt,adminLevel,...publicFields}=member;
  void pinHash;
  void age; // Legacy stored age is replaced by birthYear.
  return member.role === 'admin' ? {...publicFields,spouseNo,spouseMode,christinRanking,crReviewedAt,adminLevel} : publicFields;
}
