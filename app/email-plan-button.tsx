'use client';
import {useRef,useState} from 'react';
import {Mail} from 'lucide-react';
import {Button} from '../components/ui/button';

export function EmailPlanButton({eventId,disabled}:{eventId:number;disabled:boolean}) {
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState('');
  const [failed,setFailed]=useState(false);
  const requestId=useRef<string|null>(null);
  const pending=useRef(false);
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
  return <div className="space-y-2"><Button type="button" variant="outline" disabled={disabled||sending} onClick={()=>void send()}><Mail className="mr-2 size-4"/>{sending?'Sender…':'E-mail kampplan'}</Button>
    {message&&<p role={failed?'alert':'status'} className={`max-w-md text-sm ${failed?'text-red-700':'text-[#13375e]'}`}>{message}</p>}
  </div>;
}
