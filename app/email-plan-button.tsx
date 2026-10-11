'use client';
import {useRef,useState} from 'react';
import {Mail} from 'lucide-react';
import {Button} from '../components/ui/button';
import {bccMailtoHref} from '../lib/mailto';
import {planEmail} from '../lib/plan-email';

export function EmailPlanButton({eventId,date,signups,disabled}:{eventId:number;date:string;signups:readonly {signup:{status:string};player:{email:string}}[];disabled:boolean}) {
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState('');
  const [failed,setFailed]=useState(false);
  const requestId=useRef<string|null>(null);
  const pending=useRef(false);
  const manualHref=bccMailtoHref(signups.filter(row=>row.signup.status==='active'||row.signup.status==='waitlist').map(row=>row.player.email),planEmail('',date));
  async function send() {
    if(pending.current)return;
    pending.current=true;setSending(true);setMessage('');setFailed(false);
    requestId.current??=crypto.randomUUID();
    try {
      const response=await fetch('/api/plan-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId,requestId:requestId.current})});
      const result=await response.json() as {sent?:number;error?:string};
      if(!response.ok)throw new Error(result.error||'Afsendelsen fejlede.');
      setMessage(`Kampplanen er sendt til mailtjenesten for ${result.sent} modtagere.`);
      requestId.current=null;
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:'Afsendelsen fejlede.');}
    finally{pending.current=false;setSending(false);}
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled||sending} onClick={()=>void send()}><Mail className="mr-2 size-4"/>{sending?'Sender…':'E-mail kampplan'}</Button>
    <Button type="button" variant="outline" disabled={disabled||!manualHref} onClick={()=>{if(manualHref)window.location.href=manualHref;}}><Mail className="mr-2 size-4"/>Send Kampplan manuelt</Button></div>
    <p className="max-w-md text-sm text-slate-600">Ved manuel afsendelse: Vælg aabenbaneaften@hik.dk som afsender i dit mailprogram.</p>
    {message&&<p role={failed?'alert':'status'} className={`max-w-md text-sm ${failed?'text-red-700':'text-[#13375e]'}`}>{message}</p>}
  </div>;
}
