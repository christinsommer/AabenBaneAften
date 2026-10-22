'use client';

import {useEffect, useRef, useState} from 'react';
import {Sparkles} from 'lucide-react';
import {Button} from '../components/ui/button';
import type {UnfulfilledWish} from '../lib/unfulfilled-wishes';

type Job = {id:string;status:string;warning:string;error:string;summary?:{
  status:string;score:number;historyDates:string[];
  allocation:{id:number;name:string;memberNo:string;status:string;signupOrder:number;requested:number;assigned:number}[];
}|null};
export function OptimizerPanel({event, rows, wishes, isOpen, busy, refresh}: {
  wishes: UnfulfilledWish[];
  event: {id:number;status:string;date:string}; rows:Record<string,unknown>[];
  isOpen:boolean; busy:boolean; refresh:()=>unknown;
}) {
  const [job,setJob] = useState<Job|null>(null);
  const [starting,setStarting] = useState(false);
  const [checking,setChecking] = useState(true);
  const [error,setError] = useState('');
  const [exporting,setExporting] = useState(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const seenCompletion = useRef('');
  useEffect(()=>{
    let active=true, pending=false;
    const controller = new AbortController();
    async function poll() {
      if (pending || document.visibilityState==='hidden') return;
      pending=true;
      try {
        const response = await fetch(`/api/optimizer/jobs?eventId=${event.id}`,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        const data = await response.json() as {job:Job|null;error?:string};
        if (!response.ok) throw new Error(data.error || 'Status kunne ikke hentes.');
        if (!active) return;
        setJob(data.job); setError('');
        if (data.job?.status==='completed' && seenCompletion.current!==data.job.id) {
          seenCompletion.current=data.job.id;
          void refreshRef.current();
        }
      } catch(e) {
        if(active) setError(e instanceof Error?e.message:'Status kunne ikke hentes. Beregningen fortsætter på serveren.');
      } finally {pending=false;if(active)setChecking(false);}
    }
    void poll();
    const timer=window.setInterval(()=>void poll(),5000);
    window.addEventListener('focus',poll);
    document.addEventListener('visibilitychange',poll);
    return ()=>{active=false;controller.abort();window.clearInterval(timer);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll);};
  },[event.id]);
  async function start() {
    setStarting(true);setError('');
    try {
      const response=await fetch('/api/optimizer/jobs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:event.id}),signal:AbortSignal.timeout(20000)});
      const data=await response.json() as {job:Job|null;error?:string};
      if(!response.ok)throw new Error(data.error||'Beregningen kunne ikke startes.');
      setJob(data.job);
    } catch(e) {setError(e instanceof Error?e.message:'Opstart kunne ikke bekræftes. Status kontrolleres automatisk.');}
    finally {setStarting(false);}
  }
  async function exportPlan() {
    setExporting(true);setError('');
    try {
      const {downloadKampplan}=await import('../lib/kampplan-export');
      downloadKampplan(rows,event.date,wishes);
    } catch(e) {setError(e instanceof Error?e.message:'Kampplanen kunne ikke eksporteres.');}
    finally {setExporting(false);}
  }
  const running=job?.status==='queued'||job?.status==='running';
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="Optimering af kampplan">
    <div className="flex flex-wrap gap-3">
      <Button type="button" disabled={busy||starting||checking||running||exporting||isOpen} onClick={()=>void start()} className="bg-[#13375e]">
        <Sparkles className="mr-2 h-4 w-4"/>{starting?'Starter…':running?'Beregner kampforslag…':'Algoritme foreslå kampe'}
      </Button>
      <Button type="button" variant="outline" disabled={busy||exporting||!rows.length} onClick={()=>void exportPlan()}>{exporting?'Eksporterer…':'Eksporter kampplan'}</Button>
    </div>
    <p className="text-sm text-slate-600">Første spilletime prioriteres før anden og tredje time for tilmeldte spillere. Derefter prioriteres flere kampe, kampscore og til sidst tidlige tider. Single er tilladt fra kl. 20:30, også på tværs af køn.</p>
    {isOpen&&<p className="text-sm text-slate-600">Luk tilmeldingen, før du laver et kampforslag.</p>}
    {running&&<p role="status" className="text-sm">{job.status==='queued'?'Beregningen står i kø og starter automatisk. ':'Beregningen kører. '}Du kan skifte fane, logge ud eller låse telefonen. Kladden gemmes automatisk og kan ses her, når beregningen er færdig. Det tager normalt op til 12 minutter; ved midlertidige fejl forsøger serveren igen.</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {job?.status==='failed'&&<p role="alert" className="text-sm text-red-700">{job.error}</p>}
    {job?.status==='completed'&&job.summary&&<>
      <p role="status" className="text-sm font-semibold text-[#13375e]">{event.status==='published'?'Kampplanen er offentliggjort.':'Kampplanen er gemt som kladde nedenfor. Den er først tilgængelig for medlemmer, når du trykker “Offentliggør kampplan”.'}</p>
      {job.warning&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{job.warning}</p>}
      <p className="text-sm">{job.summary.status==='OPTIMAL'?'Optimal løsning fundet':'Gyldigt forslag fundet – optimalitet er ikke bevist'} · Samlet score: {job.summary.score}</p>
      <p className="text-sm">{job.summary.historyDates.length?`Historik: ${job.summary.historyDates.join(', ')}.`:'Ingen tidligere afholdte runder er tilgængelige.'}</p>
      <details open={job.summary.allocation.some(p=>p.assigned<p.requested)}>
        <summary className="cursor-pointer font-semibold">Fordeling af ønskede timer</summary>
        <ul className="space-y-1 text-sm">{job.summary.allocation.slice().sort((a,b)=>a.signupOrder-b.signupOrder).map(p=><li key={p.id} className={p.assigned<p.requested?'font-semibold text-amber-900':''}>#{p.signupOrder} · {p.name} ({p.memberNo}){p.status==='waitlist'?' · Venteliste':''}: {p.assigned} af {p.requested} timer</li>)}</ul>
      </details>
    </>}
  </section>;
}
