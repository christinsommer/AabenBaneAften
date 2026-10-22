'use client';
import {useEffect,useId,useState} from 'react';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Label} from '../components/ui/label';
type Person={id:number;name:string};
export function SpouseSearch({initial,onChange,disabled}:{initial:Person|null;onChange:(id:number|null)=>void;disabled:boolean}) {
  const id=useId();
  const [selected,setSelected]=useState(initial);
  const [query,setQuery]=useState('');
  const [result,setResult]=useState<{query:string;items:Person[]}|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const eligible=(query.match(/\p{L}/gu)??[]).length>=3;
  useEffect(()=>{
    if(!eligible)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setLoading(true);setError('');
      try {
        const response=await fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lookup_spouse',query}),signal:controller.signal});
        const data=await response.json() as {members:Person[];error?:string};
        if(!response.ok)throw new Error(data.error||'Søgningen mislykkedes.');
        if(!controller.signal.aborted)setResult({query,items:data.members});
      } catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Prøv igen.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,eligible]);
  return <section className="space-y-2">
    <Label htmlFor={id}>Spouse (valgfrit)</Label>
    {selected&&<div className="flex items-center justify-between gap-2 rounded-md border p-2"><span>{selected.name}</span><Button type="button" variant="outline" disabled={disabled} onClick={()=>{setSelected(null);onChange(null);}}>Fjern</Button></div>}
    <Input id={id} type="search" value={query} maxLength={100} disabled={disabled} autoComplete="off" placeholder="Søg på Fornavn Efternavn" aria-describedby={`${id}-help`} onChange={e=>{setQuery(e.target.value);setError('');setLoading(false);}}/>
    <p id={`${id}-help`} className="text-sm text-slate-600">Skriv mindst tre bogstaver i navnet, og vælg en spiller. Dit valg gemmes med “Gem profil” og betyder “Spille samtidigt”. Kun Admin kan ændre spillebetingelsen.</p>
    {eligible&&loading&&<p role="status" className="text-sm">Søger…</p>}
    {eligible&&result?.query===query&&<ul className="space-y-1">{result.items.map(p=><li key={p.id}><button type="button" disabled={disabled} className="w-full rounded-md border p-2 text-left hover:bg-slate-50" onClick={()=>{setSelected(p);onChange(p.id);setQuery('');setResult(null);}}>{p.name}</button></li>)}{!result.items.length&&<li className="text-sm">Ingen medlemmer fundet.</li>}</ul>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
