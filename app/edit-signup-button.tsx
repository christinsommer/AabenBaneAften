'use client';
import {useRef,useState} from 'react';
import {Pencil} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,DialogTrigger} from '../components/ui/dialog';
import {includeIntermediateTimes,signupInput} from '../lib/signup';
import {playTimeLabel} from '../lib/play-schedule';

type Signup = {id:number;requestedHours:number;availability:string;status:string};
export function EditSignupButton({signup,eventId,name,times,busy,disabled,act}:{
  signup:Signup;eventId:number;name:string;times:string[];busy:boolean;disabled:boolean;
  act:(body:Record<string,unknown>,onError?:(message:string)=>void)=>Promise<boolean>;
}) {
  const [open,setOpen]=useState(false);
  const [hours,setHours]=useState(1);
  const [selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const pending=useRef(false);
  const original=useRef({requestedHours:signup.requestedHours,availability:signup.availability,status:signup.status});
  function changeOpen(value:boolean) {
    if(pending.current)return;
    if(value){
      original.current={requestedHours:signup.requestedHours,availability:signup.availability,status:signup.status};
      setHours(signup.requestedHours||1);
      setSelected((JSON.parse(signup.availability) as string[]).filter(t=>times.includes(t)));
      setError('');
    }
    setOpen(value);
  }
  async function save(e:React.FormEvent) {
    e.preventDefault();if(pending.current||busy)return;
    setError('');
    try {
      const expanded=includeIntermediateTimes(selected,times);
      const input=signupInput({nHours:hours,nPossible:expanded.length,szPossible:expanded},times);
      pending.current=true;setSaving(true);
      let reported=false;
      const ok=await act({action:'admin_update_signup',eventId,signupId:signup.id,...input,expected:original.current},message=>{reported=true;setError(message);});
      if(ok)setOpen(false);
      else if(!reported)setError('Tilmeldingen blev ikke gemt. Prøv igen.');
    } catch(e){setError(e instanceof Error?e.message:'Tilmeldingen kunne ikke gemmes.');}
    finally{pending.current=false;setSaving(false);}
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" size="icon-xs" disabled={busy||disabled} aria-label={`Rediger tilmelding for ${name}`} title={disabled?'Kun den aktuelle runde kan redigeres.':`Rediger tilmelding for ${name}`}><Pencil className="size-3" aria-hidden="true"/></Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto" showCloseButton={!saving}>
      <DialogHeader><DialogTitle>Rediger tilmelding – {name}</DialogTitle><DialogDescription>Ret ønskede timer og mulige starttider. Status ændres via listen. Ændringerne bruges ved næste beregning af kampplanen.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy||saving} className="space-y-4">
          <label className="grid gap-2 text-sm font-medium">Ønskede timer<select className="h-10 rounded-md border px-3" value={hours} onChange={e=>setHours(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} {n===1?'time':'timer'}</option>)}</select></label>
          {(['00','30'] as const).map(minute=>{
            const options=times.filter(t=>t.endsWith(`:${minute}`));
            return options.length>0&&<fieldset key={minute}><legend className="mb-2 text-sm font-semibold">{minute==='00'?'Start på hel time':'Start på halv time'}</legend><div className="grid grid-cols-2 gap-2">{options.map(t=><label key={t} className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={selected.includes(t)} onChange={e=>setSelected(e.target.checked?[...selected,t]:selected.filter(v=>v!==t))}/>{playTimeLabel(t)}</label>)}</div></fieldset>;
          })}
          <p className="text-xs text-slate-600">Vælg mindst 2 tider for 1 time, 4 tider for 2 timer og 6 tider for 3 timer, med nok tider uden overlap. Tilgængelige mellemliggende tider tilføjes ved valg af sammenhængende timer.</p>
        </fieldset>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={()=>changeOpen(false)}>Annuller</Button><Button type="submit" disabled={busy||saving}>{saving?'Gemmer…':'Gem tilmelding'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
