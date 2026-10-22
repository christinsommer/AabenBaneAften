'use client';
import {useState} from 'react';
import {Card,CardHeader,CardTitle,CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {defaultOptimizerResources,parseOptimizerResources,type OptimizerResources} from '../lib/optimizer-resources';

export function OptimizerResourcesForm({defaults=defaultOptimizerResources,act,busy}:{defaults?:OptimizerResources;act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
  const [values,setValues]=useState({cpu:String(defaults.cpu),seconds:String(defaults.seconds)});
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  return <Card><CardHeader><CardTitle>CPU og tid for optimering</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setError('');setSaved(false);
      try {if(await act({action:'set_optimizer_resources',optimizerResources:parseOptimizerResources(values)}))setSaved(true);}
      catch(e){setError(e instanceof Error?e.message:'Kontrollér CPU og tid.');}
    }}>
      <p className="text-sm text-slate-600">Bruges ved næste klik på “Algoritme foreslå kampe”. CPU angiver antal beregningstråde. Beregningen kan afsluttes før tidsgrænsen, hvis løsningen er fundet.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {(['cpu','seconds'] as const).map(key=><label key={key} className="grid gap-1 text-sm">
          <span className="font-medium">{key==='cpu'?'CPU (antal tråde)':'Tid (sekunder)'}</span>
          <input type="number" min={1} max={key==='cpu'?32:900} step={1} required className="h-10 rounded-md border px-3" value={values[key]} onChange={e=>{setValues({...values,[key]:e.target.value});setSaved(false);}}/>
          <span className="text-xs text-slate-600">{key==='cpu'?'1–32 tråde. Standard: 4.':'1–900 sekunder. Standard: 600.'}</span>
        </label>)}
      </fieldset>
      <Button disabled={busy}>Gem CPU og tid</Button>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved&&<p role="status">CPU og tid er gemt.</p>}
    </form>
  </CardContent></Card>;
}
