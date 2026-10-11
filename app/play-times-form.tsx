'use client';
import {useState} from 'react';
import {Card,CardHeader,CardTitle,CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {defaultPlayTimes,parsePlayTimes,type PlayTimes} from '../lib/play-schedule';

export function PlayTimesForm({defaults=defaultPlayTimes,act,busy}:{defaults?:PlayTimes;act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
  const [values,setValues]=useState({whole:defaults.whole.join(', '),half:defaults.half.join(', ')});
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  return <Card><CardHeader><CardTitle>Spilletider ved tilmelding</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setError('');setSaved(false);
      try {if(await act({action:'set_play_times',playTimes:parsePlayTimes(values)}))setSaved(true);}
      catch(e){setError(e instanceof Error?e.message:'Kontrollér spilletiderne.');}
    }}>
      <p className="text-sm text-slate-600">Starttiderne vises under “Start på hel time” og “Start på halv time”, når medlemmer vælger deres spilleønsker. Hver kamp varer én time. Ændringer gælder straks; eksisterende spilleønsker ændres ikke automatisk.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {(['whole','half'] as const).map(key=><label key={key} className="grid gap-1 text-sm">
          <span className="font-medium">{key==='whole'?'Hele timer tider':'Halve timer tider'}</span>
          <input className="h-10 rounded-md border px-3" value={values[key]} onChange={e=>{setValues({...values,[key]:e.target.value});setSaved(false);}} placeholder={key==='whole'?'18:00, 19:00, 20:00, 21:00':'18:30, 19:30, 20:30'} />
          <span className="text-xs text-slate-600">Tider adskilt med komma. Lad feltet stå tomt, hvis gruppen ikke bruges.</span>
        </label>)}
      </fieldset>
      <Button disabled={busy}>Gem spilletider</Button>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved&&<p role="status">Spilletiderne er gemt.</p>}
    </form>
  </CardContent></Card>;
}
