'use client';
import {useState} from 'react';
import {Button} from '../components/ui/button';
import {ImportedPlanTable} from './imported-plan';

export function PastPlan({eventId}: {eventId:number}) {
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<Record<string,unknown>[]|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  async function toggle() {
    if(open){setOpen(false);return;}
    setOpen(true);
    if(rows!==null)return;
    setLoading(true);setError('');
    try {
      const response=await fetch(`/api/past-plan?eventId=${eventId}`,{cache:'no-store'});
      const result=await response.json() as {error?:string;rows?:Record<string,unknown>[]};
      if(!response.ok)throw new Error(result.error||'Kampplanen kunne ikke indlæses.');
      if(!Array.isArray(result.rows))throw new Error('Kampplanen kunne ikke læses.');
      setRows(result.rows);
    }catch(error){setError(error instanceof Error?error.message:'Kampplanen kunne ikke indlæses.');}
    finally{setLoading(false);}
  }
  return <div className="mt-2 min-w-0">
    <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={`past-plan-${eventId}`} disabled={loading} onClick={()=>void toggle()}>{open?'Skjul kampplan':'Vis kampplan'}</Button>
    {open&&<div id={`past-plan-${eventId}`} className="mt-3 min-w-0">
      {loading&&<p role="status" className="text-sm">Henter kampplanen…</p>}
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {rows!==null&&(rows.length?<ImportedPlanTable rows={rows}/>:<p className="text-sm text-slate-600">Der er ingen gemt kampplan for denne spilledag.</p>)}
    </div>}
  </div>;
}
