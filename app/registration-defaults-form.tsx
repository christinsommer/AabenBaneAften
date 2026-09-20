'use client';

import {useState} from 'react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {parseRegistrationDefaults, type RegistrationDefaults} from '../lib/registration-defaults';

export function RegistrationDefaultsForm({defaults,act,busy}: {defaults:RegistrationDefaults;act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
  const [values,setValues]=useState(defaults);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  return <Card className="border-[#dce9e1]">
    <CardHeader><CardTitle>Standard for tilmelding</CardTitle><CardDescription>Bruges til nye spilledage. Tidspunkterne er dansk tid.</CardDescription></CardHeader>
    <CardContent><form className="space-y-4" onSubmit={async event=>{
      event.preventDefault();setSaved(false);setError('');
      try {const parsed=parseRegistrationDefaults(values);if(await act({action:'set_registration_defaults',...parsed}))setSaved(true);}
      catch(error){setError(error instanceof Error?error.message:'Kontrollér indstillingerne.');}
    }}>
      {(['open','close'] as const).map(kind=><fieldset key={kind} disabled={busy} className="space-y-2">
        <legend className="font-semibold">{kind==='open'?'Tilmelding åbner':'Tilmelding lukker'}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Antal dage før
            <select className="h-10 rounded-md border px-3" value={values[`${kind}Days`]} onChange={event=>{
              const days=Number(event.target.value);setSaved(false);
              setValues({...values,[`${kind}Days`]:days,...(kind==='open'&&values.closeDays>days?{closeDays:days}:{})});
            }}>{Array.from({length:kind==='open'?6:values.openDays},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select>
          </label>
          <label className="grid gap-1 text-sm">{kind==='open'?'Starttidspunkt':'Sluttidspunkt'} (hh:mm)
            <input type="text" required pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="hh:mm" title="24-timers ur, fx 06:30 eller 18:00" className="h-10 rounded-md border px-3" value={values[`${kind}Time`]} onChange={event=>{setSaved(false);setValues({...values,[`${kind}Time`]:event.target.value});}} />
          </label>
        </div>
      </fieldset>)}
      <p className="text-sm text-slate-600">Lukkedagen må højst være lige så mange dage før spilledagen som åbningsdagen. Ved samme dag skal sluttidspunktet være senere end starttidspunktet.</p>
      <Button disabled={busy} className="bg-[#13375e]">Gem standardværdier</Button>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved&&<p role="status" className="text-sm text-[#13375e]">Standardværdierne er gemt.</p>}
    </form></CardContent>
  </Card>;
}
