'use client';
import {useId,useState} from 'react';
import {birthYearOptions} from '../lib/birth-year';
import {Button} from '../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../components/ui/dialog';
type Props={act:(payload:Record<string,unknown>)=>Promise<boolean>;busy:boolean};
export function BirthYearForm({act,busy,onSaved}:Props&{onSaved?:()=>void}) {
  const id=useId();
  const [year,setYear]=useState('');
  const [error,setError]=useState('');
  return <form className="space-y-3" onSubmit={async e=>{
    e.preventDefault();if(busy)return;setError('');
    if(await act({action:'update_birth_year',birthYear:year}))onSaved?.();
    else setError('Fødselsåret kunne ikke gemmes. Prøv igen.');
  }}>
    <label htmlFor={id} className="block text-sm font-medium">Fødselsår</label>
    <select id={id} required value={year} onChange={e=>setYear(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3">
      <option value="">Vælg fødselsår</option>{birthYearOptions().map(y=><option key={y} value={y}>{y}</option>)}
    </select>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <Button type="submit" disabled={busy||!year}>{busy?'Gemmer…':'Gem fødselsår'}</Button>
  </form>;
}
export function BirthYearPrompt(props:Props) {
  const [open,setOpen]=useState(true);
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent>
    <DialogHeader><DialogTitle>Hjælp os med at lave bedre kampplaner</DialogTitle><DialogDescription>Angiv dit fødselsår, så vi kan tage hensyn til alder i kampfordelingen. Det er frivilligt, og du kan stadig tilmelde dig uden.</DialogDescription></DialogHeader>
    <BirthYearForm {...props} onSaved={()=>setOpen(false)}/>
    <Button type="button" variant="outline" onClick={()=>setOpen(false)}>Senere</Button>
  </DialogContent></Dialog>;
}
export function BirthYearReminder(props:Props) {
  return <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold">Hjælp os med at lave bedre kampplaner</h2><p className="text-sm">Vi mangler dit fødselsår. Det bruges til aldershensyn i kampfordelingen. Du kan stadig tilmelde dig uden.</p><BirthYearForm {...props}/></section>;
}
