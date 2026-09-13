export function visibleMember<T extends {pinHash:string;christinRanking:number|null;adminLevel:unknown;role:string}>(member:T) {
  const {pinHash,christinRanking,adminLevel,...publicFields}=member;
  void pinHash;
  return member.role === 'admin' ? {...publicFields,christinRanking,adminLevel} : publicFields;
}
