export const optimizerObjectives = [
  {id:'active:1',label:'Aktive: første time',description:'Flest mulige aktive får mindst én time inden for deres ønsker.'},
  {id:'active:2',label:'Aktive: anden time',description:'Flest mulige aktive får mindst to timer inden for deres ønsker.'},
  {id:'active:3',label:'Aktive: tredje time',description:'Flest mulige aktive får tre timer, hvis de har ønsket det.'},
  {id:'active:signupOrder',label:'Aktive: tilmeldingsrækkefølge',description:'Spillertimer vægtes efter tilmeldingsrækkefølgen: tidligere tilmeldte har højere vægt. Gælder både første time og ekstra timer.'},
  {id:'waitlist:1',label:'Venteliste: første time',description:'Flest mulige på ventelisten får mindst én time inden for deres ønsker.'},
  {id:'waitlist:2',label:'Venteliste: anden time',description:'Flest mulige på ventelisten får mindst to timer inden for deres ønsker.'},
  {id:'waitlist:3',label:'Venteliste: tredje time',description:'Flest mulige på ventelisten får tre timer, hvis de har ønsket det.'},
  {id:'waitlist:signupOrder',label:'Venteliste: tilmeldingsrækkefølge',description:'Spillertimer på ventelisten vægtes efter tilmeldingsrækkefølgen. Gælder både første time og ekstra timer.'},
  {id:'matches',label:'Antal kampe',description:'Flest mulige kampe, uden at forringe tidligere prioriteter.'},
  {id:'score',label:'Kvalitetsscore',description:'Højest mulig samlet score med de konfigurerede faktorer. Dette er ikke en gennemsnitsscore; målet kan foretrække færre kampe, hvis ekstra kampe har negativ score.'},
  {id:'early',label:'Tidlige spilletider',description:'Flere spillertimer på de tidligste tidspunkter. Et tidligere tidspunkt prioriteres over alle senere tidspunkter.'},
  {id:'courts',label:'Banepræference',description:'Foretræk banerne i den konfigurerede banerækkefølge.'},
] as const;
export type OptimizerObjectiveId = typeof optimizerObjectives[number]['id'];
export type OptimizerPriority = {id:OptimizerObjectiveId;enabled:boolean};
export const defaultOptimizerPriorities:readonly OptimizerPriority[] = optimizerObjectives.map(({id})=>({id,enabled:true}));

export function parseOptimizerPriorities(value:unknown):OptimizerPriority[] {
  if(!Array.isArray(value)||value.length!==optimizerObjectives.length)throw new Error('Prioriteringen skal indeholde alle 12 mål.');
  const remaining=new Set<string>(optimizerObjectives.map(p=>p.id));
  return value.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||!remaining.delete(entry.id)||typeof entry.enabled!=='boolean')
      throw new Error('Hvert mål skal optræde én gang med en gyldig til/fra-værdi.');
    return {id:entry.id as OptimizerObjectiveId,enabled:entry.enabled};
  });
}
