'use client';
import {useRef,useState} from 'react';
import {Mail} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from '../components/ui/dialog';
import {bccMailtoHref} from '../lib/mailto';
import {planEmail} from '../lib/plan-email';

const mailPreferenceKey='aabenbane.manual-plan-mail-client';
type MailClient='outlook'|'apple-gmail';

export function EmailPlanButton({eventId,date,signups,disabled}:{eventId:number;date:string;signups:readonly {signup:{status:string};player:{email:string}}[];disabled:boolean}) {
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState('');
  const [failed,setFailed]=useState(false);
  const [manualOpen,setManualOpen]=useState(false);
  const [preferredClient,setPreferredClient]=useState<MailClient|null>(null);
  const outlookButton=useRef<HTMLButtonElement>(null);
  const appleButton=useRef<HTMLButtonElement>(null);
  const requestId=useRef<string|null>(null);
  const pending=useRef(false);
  const manualRecipients=signups.filter(row=>row.signup.status==='active'||row.signup.status==='waitlist').map(row=>row.player.email);
  const manualHref=bccMailtoHref(manualRecipients,planEmail('',date));
  function changeManualOpen(open:boolean) {
    if(open) {
      try {
        const saved=window.localStorage.getItem(mailPreferenceKey);
        setPreferredClient(saved==='outlook'||saved==='apple-gmail'?saved:null);
      }catch {
        // Keep the current session preference when browser storage is unavailable.
      }
    }
    setManualOpen(open);
  }
  function sendManually(client:MailClient) {
    if(disabled)return;
    const separator=client==='outlook'?';':',';
    const href=bccMailtoHref(manualRecipients,planEmail('',date),separator);
    if(!href)return;
    setPreferredClient(client);
    try {
      window.localStorage.setItem(mailPreferenceKey,client);
    }catch {
      // Opening the mail app must also work when browser storage is blocked.
    }
    setManualOpen(false);
    window.location.href=href;
  }
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
    <Dialog open={manualOpen} onOpenChange={changeManualOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled||!manualHref}><Mail className="mr-2 size-4"/>Send Kampplan manuelt</Button></DialogTrigger>
      <DialogContent onOpenAutoFocus={event=>{
        const button=preferredClient==='outlook'?outlookButton.current:preferredClient==='apple-gmail'?appleButton.current:null;
        if(button){event.preventDefault();button.focus();}
      }}>
        <DialogHeader>
          <DialogTitle>Vælg mailprogram</DialogTitle>
          <DialogDescription>Vælg det mailprogram, du bruger som standard på enheden. Modtagerne indsættes i BCC.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button ref={outlookButton} type="button" variant={preferredClient==='outlook'?'default':'outline'} disabled={disabled||!manualHref} onClick={()=>sendManually('outlook')}>Outlook{preferredClient==='outlook'?' (standard)':''}</Button>
          <Button ref={appleButton} type="button" variant={preferredClient==='apple-gmail'?'default':'outline'} disabled={disabled||!manualHref} onClick={()=>sendManually('apple-gmail')}>Apple / Gmail{preferredClient==='apple-gmail'?' (standard)':''}</Button>
        </div>
        <p className="text-sm text-muted-foreground">Bruger du Apple Mail eller Gmail, også på Android, skal du vælge Apple / Gmail.</p>
        <p className="text-sm text-muted-foreground">Dit seneste valg huskes i denne browser. Du kan altid vælge det andet mailprogram.</p>
      </DialogContent>
    </Dialog></div>
    <p className="max-w-md text-sm text-slate-600">Ved manuel afsendelse: Vælg aabenbaneaften@hik.dk som afsender i dit mailprogram.</p>
    {message&&<p role={failed?'alert':'status'} className={`max-w-md text-sm ${failed?'text-red-700':'text-[#13375e]'}`}>{message}</p>}
  </div>;
}
