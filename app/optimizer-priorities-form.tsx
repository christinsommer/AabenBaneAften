'use client';
import {useRef,useState} from 'react';
import {ArrowDown,ArrowUp,GripVertical,Info} from 'lucide-react';
import {Card,CardHeader,CardTitle,CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {defaultOptimizerPriorities,optimizerObjectives,parseOptimizerPriorities,type OptimizerPriority} from '../lib/optimizer-priorities';

export function OptimizerPrioritiesForm({defaults=defaultOptimizerPriorities,act,busy}:{defaults?:readonly OptimizerPriority[];act:(body:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
  const [items,setItems]=useState(()=>parseOptimizerPriorities(defaults));
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [help,setHelp]=useState<string|null>(null);
  const [dragged,setDragged]=useState<string|null>(null);
  const list=useRef<HTMLOListElement>(null);
  const source=useRef<string|null>(null);
  function move(id:string,target:string) {
    setItems(current=>{const next=[...current],from=next.findIndex(p=>p.id===id),to=next.findIndex(p=>p.id===target);if(from<0||to<0||from===to)return current;const [item]=next.splice(from,1);next.splice(to,0,item);return next;});
    setMessage('Rækkefølgen er ændret. Husk at gemme.');
  }
  function drop() {source.current=null;setDragged(null);}
  return <Card><CardHeader><CardTitle>Prioritering af optimeringen</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setError('');setMessage('');try{if(await act({action:'set_optimizer_priorities',optimizerPriorities:parseOptimizerPriorities(items)}))setMessage('Prioriteringen er gemt og gælder næste beregning.');}catch(e){setError(e instanceof Error?e.message:'Prioriteringen kunne ikke gemmes.');}}}>
      <p className="text-sm text-slate-600">Øverste aktive mål prioriteres først. Træk i håndtaget eller brug pilene. Senere mål må ikke forringe tidligere opnåede resultater. Ændringer påvirker kun nye beregninger.</p>
      <p className="text-sm text-slate-600">Spilleønsker, tilgængelighed, ægtefælleregler og øvrige ufravigelige regler gælder altid.</p>
      <fieldset disabled={busy}>
        <ol ref={list} className="space-y-2" aria-label="Optimeringsmål i prioriteret rækkefølge"
          onPointerMove={e=>{if(!source.current||busy)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-priority]');if(target&&list.current?.contains(target))move(source.current,target.dataset.priority!);}}
          onPointerUp={drop} onPointerCancel={drop} onLostPointerCapture={drop}>
          {items.map((item,index)=>{
            const info=optimizerObjectives.find(p=>p.id===item.id)!;
            return <li key={item.id} data-priority={item.id} className={`rounded-lg border p-3 ${dragged===item.id?'border-blue-600 bg-blue-50':'bg-white'}`}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex">
                <button type="button" disabled={busy} aria-label={`Træk ${info.label}`} aria-pressed={dragged===item.id} className="touch-none cursor-grab rounded p-2 focus-visible:outline-2"
                  onPointerDown={e=>{if(busy||e.button!==0)return;source.current=item.id;setDragged(item.id);list.current?.setPointerCapture(e.pointerId);}}>
                  <GripVertical className="h-5 w-5" aria-hidden="true"/>
                </button>
                <span className="min-w-0 flex-1 break-words text-sm font-medium"><span className="mr-2 text-slate-500">{index+1}.</span>{info.label}</span>
                <button type="button" aria-label={`Information om ${info.label}`} aria-expanded={help===item.id} aria-controls={`priority-help-${item.id}`} className="rounded p-2" onClick={()=>setHelp(help===item.id?null:item.id)}><Info aria-hidden="true" className="h-5 w-5"/></button>
                <label className="col-start-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} aria-label={`Aktivér ${info.label}`} onChange={e=>{setItems(items.map(p=>p.id===item.id?{...p,enabled:e.target.checked}:p));setMessage('Ændringerne er ikke gemt endnu.');}}/>{item.enabled?'Til':'Fra'}</label>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="outline" disabled={busy||index===0} aria-label={`Flyt ${info.label} op`} onClick={()=>move(item.id,items[index-1].id)}><ArrowUp className="h-4 w-4"/></Button>
                  <Button type="button" size="icon" variant="outline" disabled={busy||index===items.length-1} aria-label={`Flyt ${info.label} ned`} onClick={()=>move(item.id,items[index+1].id)}><ArrowDown className="h-4 w-4"/></Button>
                </div>
              </div>
              <p id={`priority-help-${item.id}`} hidden={help!==item.id} className="mt-2 text-sm text-slate-600">{info.description}</p>
            </li>;
          })}
        </ol>
      </fieldset>
      {!items.some(p=>p.enabled)&&<p className="text-sm text-amber-800">Alle mål er slået fra. Der søges kun efter en gyldig plan; der garanteres ingen kampe eller optimal timefordeling.</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={busy}>Gem prioritering</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setItems(parseOptimizerPriorities(defaultOptimizerPriorities));setMessage('Standardrækkefølgen er gendannet med alle mål slået til. Husk at gemme.');}}>Gendan standardrækkefølge</Button></div>
      <p role="status" className="text-sm">{message}</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  </CardContent></Card>;
}
