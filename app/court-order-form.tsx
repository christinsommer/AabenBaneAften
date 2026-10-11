'use client';
import {useState} from 'react';
import {Card, CardHeader, CardTitle, CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {defaultCourtOrder, parseCourtOrder, type CourtOrder} from '../lib/court-order';

export function CourtOrderForm({defaults=defaultCourtOrder,act,busy}:{defaults?:CourtOrder;act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
  const [values,setValues]=useState({whole:defaults.whole.join(', '),half:defaults.half.join(', ')});
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  return <Card><CardHeader><CardTitle>Banerækkefølge</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setError('');setSaved(false);
      try {if(await act({action:'set_court_order',courtOrder:parseCourtOrder(values)}))setSaved(true);}
      catch(e){setError(e instanceof Error?e.message:'Kontrollér rækkefølgen.');}
    }}>
      <p className="text-sm text-slate-600">Angiv de baner, der må bruges, i prioriteret rækkefølge. Andre baner bruges ikke. Du kan angive andre banenumre om sommeren. Lad en gruppe stå tom, hvis den ikke bruges.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {(['whole','half'] as const).map(key=><label key={key} className="grid gap-1 text-sm">
          <span className="font-medium">{key==='whole'?'Hele timer rækkefølge':'Halve timer rækkefølge'}</span>
          <input className="h-10 rounded-md border px-3" value={values[key]} onChange={e=>{setValues({...values,[key]:e.target.value});setSaved(false);}} />
          <span className="text-xs text-slate-600">Banenumre adskilt med komma, fx {key==='whole'?'4, 3, 2, 1':'5, 6, 7'}.</span>
        </label>)}
      </fieldset>
      <Button disabled={busy}>Gem banerækkefølge</Button>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved&&<p role="status">Banerækkefølgen er gemt.</p>}
    </form>
  </CardContent></Card>;
}
