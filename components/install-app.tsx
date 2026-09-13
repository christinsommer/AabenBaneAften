'use client';

import {useEffect,useState} from 'react';
import {Download,Smartphone} from 'lucide-react';

type InstallEvent = Event & {
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
};

export function InstallApp() {
  const [prompt,setPrompt]=useState<InstallEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const media=window.matchMedia('(display-mode: standalone)');
    const update=()=>setInstalled(media.matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
    const before=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
    const done=()=>{setInstalled(true);setPrompt(null);};
    update();
    window.addEventListener('beforeinstallprompt',before);
    window.addEventListener('appinstalled',done);
    media.addEventListener('change',update);
    return ()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);media.removeEventListener('change',update);};
  },[]);
  async function install() {
    if(!prompt)return;
    try {
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted')setInstalled(true);
      setPrompt(null);
    } catch {setMessage('Brug browserens menu til at føje appen til hjemmeskærmen.');}
  }
  if(installed)return null;
  return <aside className="mx-auto my-6 max-w-5xl px-5 text-sm text-slate-600">
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-[#13375e]"><Smartphone className="mr-2 inline h-4 w-4"/>Gem appen på din telefon</summary>
      <div className="mt-3 space-y-2">
        {prompt && <button onClick={install} className="inline-flex items-center gap-2 rounded-lg bg-[#13375e] px-4 py-2 text-white"><Download className="h-4 w-4"/>Installér Åben Bane</button>}
        <p><strong>iPhone:</strong> Åbn siden i Safari, tryk på Del, og vælg Føj til hjemmeskærm. Vælg Åbn som webapp, hvis muligheden vises.</p>
        <p><strong>Android:</strong> Åbn siden i Chrome, tryk på menuen ⋮, og vælg Føj til startskærm eller Installér app.</p>
        <p>Åben Bane får sit eget ikon og åbner som en app. Du skal være online for at se og gemme tilmeldinger.</p>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  </aside>;
}
