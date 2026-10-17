'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';

type Admin={id:number;name:string;memberNo:string;role:string};
export function AdminMfaReset({members,ownId,act,busy}:{members:Admin[];ownId:number;act:(body:Record<string,unknown>,onError?:(message:string)=>void)=>Promise<boolean>;busy:boolean}) {
 const [selected,setSelected]=useState(''),[open,setOpen]=useState(false),[pin,setPin]=useState(''),[code,setCode]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const admins=members.filter(p=>p.role==='admin'&&p.id!==ownId).sort((a,b)=>a.name.localeCompare(b.name,'da'));
 const target=admins.find(p=>String(p.id)===selected);
 function close(){setOpen(false);setPin('');setCode('');setConfirmed(false);setError('');}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!target||!confirmed)return;
  setError('');setMessage('');
  const ok=await act({action:'mfa_reset_admin',playerId:target.id,currentPin:pin,code,identityConfirmed:confirmed},setError);
  setPin('');setCode('');
  if(ok){setMessage(`2FA er nulstillet for ${target.name} (${target.memberNo}). Ved næste login skal administratoren opsætte sin authenticator igen og gemme nye gendannelseskoder.`);close();}
 }
 return <section className="space-y-3 rounded-xl border bg-white p-6" aria-label="Nulstil administrators 2FA">
 <h3 className="text-lg font-semibold">Nulstil en anden Admins 2FA</h3>
 <p className="text-sm text-slate-600">Brug dette, hvis en administrator har mistet både telefon og gendannelseskoder. Kontrollér personens identitet via en uafhængig kanal først.</p>
 <Label htmlFor="reset-admin-2fa-target">Administrator</Label>
 <select id="reset-admin-2fa-target" value={selected} disabled={busy||open} onChange={e=>{setSelected(e.target.value);setMessage('');}} className="block min-h-10 w-full rounded-md border px-3">
 <option value="">Vælg administrator</option>{admins.map(p=><option key={p.id} value={p.id}>{p.name} ({p.memberNo})</option>)}
 </select>
 {!admins.length&&<p className="text-sm">Der er ingen andre administratorer.</p>}
 <Button type="button" variant="outline" disabled={busy||!target} onClick={()=>{setMessage('');setOpen(true);}}>Nulstil 2FA</Button>
 {message&&<p role="status" className="text-sm text-green-800">{message}</p>}
 <Dialog open={open} onOpenChange={value=>{if(!busy){if(value)setOpen(true);else close();}}}>
 <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader>
 <DialogTitle>Nulstil 2FA for {target?.name} ({target?.memberNo})?</DialogTitle>
 <DialogDescription>Administratorens sessioner, huskede enheder, gamle 2FA-opsætning, gendannelseskoder og igangværende login- og PIN-nulstillingsforsøg tilbagekaldes. PIN og Admin-rolle bevares. Handlingen registreres i sikkerhedsloggen.</DialogDescription>
 </DialogHeader><form onSubmit={submit} className="space-y-3">
 <Label htmlFor="reset-admin-own-pin">Din egen PIN-kode</Label><Input id="reset-admin-own-pin" autoFocus type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{4,8}" maxLength={8} required disabled={busy} value={pin} onChange={e=>setPin(e.target.value)}/>
 <Label htmlFor="reset-admin-own-code">Din egen 2FA-kode eller gendannelseskode</Label><Input id="reset-admin-own-code" autoComplete="one-time-code" maxLength={40} required disabled={busy} value={code} onChange={e=>setCode(e.target.value)}/>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Jeg har kontrolleret denne administrators identitet via en uafhængig kanal.</label>
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Annuller</Button><Button type="submit" variant="destructive" disabled={busy||!target||!confirmed||!pin||!code}>{busy?'Nulstiller…':'Bekræft nulstilling af 2FA'}</Button></div>
 </form></DialogContent></Dialog>
 </section>;
}
