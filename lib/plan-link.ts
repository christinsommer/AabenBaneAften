export function planLink(search:string) {
  const query=new URLSearchParams(search);
  return {open:query.get('view')==='plan',onlyMine:query.get('mine')==='1',date:query.get('date')};
}
