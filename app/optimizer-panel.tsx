'use client';

import {useEffect, useState} from 'react';
import {Info, Sparkles} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Label} from '../components/ui/label';
import {ImportedPlanTable} from './imported-plan';
import {algorithmWeightDefaults, type AlgorithmWeights, type ProposedMatch} from '../lib/optimizer';
import type {UnfulfilledWish} from '../lib/unfulfilled-wishes';
import {optimizerHelp, restoreWeights, weightFields} from '../lib/optimizer-settings';
import {Popover, PopoverContent, PopoverTrigger} from '../components/ui/popover';

type Proposal = {
  matches: ProposedMatch[]; rows: Record<string, string>[]; score: number; status: string; fingerprint: string;
  weights: AlgorithmWeights; historyDates: string[];
  allocation: {id: number; name: string; memberNo: string; signupOrder: number; status: string; requested: number; assigned: number}[];
};
export function OptimizerPanel({event, rows, wishes, initialWeights, isOpen, busy, refresh}: {
  wishes: UnfulfilledWish[];
  initialWeights?: AlgorithmWeights;
  event: {id: number; status: string; date: string}; rows: Record<string, unknown>[]; isOpen: boolean; busy: boolean; refresh: () => unknown;
}) {
  const [weights, setWeights] = useState<Record<string, string>>(() => weightFields(initialWeights));
  useEffect(() => {
    if (initialWeights) return;
    try { setWeights(weightFields(restoreWeights(localStorage.getItem('optimizer-weights')))); } catch { /* Storage can be disabled. */ }
  }, [initialWeights]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [working, setWorking] = useState<'solve' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  async function exportPlan() {
    setExporting(true); setError('');
    try {
      const {downloadKampplan} = await import('../lib/kampplan-export');
      downloadKampplan(rows, event.date, wishes);
    } catch (e) { setError(e instanceof Error ? e.message : 'Kampplanen kunne ikke eksporteres.'); }
    finally { setExporting(false); }
  }
  async function run(action: 'solve' | 'save') {
    setWorking(action); setError(''); setSaved(false);
    if (action === 'solve') setProposal(null);
    try {
      async function request(body: Record<string, unknown>) {
        const response = await fetch('/api/optimizer', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
          signal: AbortSignal.timeout(720_000), body: JSON.stringify({...body, eventId: event.id})});
        const data = await response.json() as Proposal & {error?: string};
        if (!response.ok) throw new Error(data.error || 'Forslaget kunne ikke behandles.');
        return data;
      }
      const result = action === 'solve' ? await request({action: 'solve',
        weights: Object.fromEntries(Object.entries(weights).map(([k,v]) => [k, v === '' ? '' : Number(v)])),
      }) : proposal!;
      setProposal(result);
      setWeights(weightFields(result.weights));
      try { localStorage.setItem('optimizer-weights', JSON.stringify(result.weights)); } catch { /* Keep the in-memory values. */ }
      if (!result.matches.length) throw new Error('Der blev ikke fundet nogen kampe. Kampplanen er ikke ændret.');
      setWorking('save');
      await request({action: 'save', weights: result.weights, matches: result.matches, fingerprint: result.fingerprint});
      await refresh();
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Forslaget kunne ikke behandles.'); }
    finally {setWorking(null);}
  }
  const disabled = busy || working !== null;
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="Optimering af kampplan">
    <div className="flex flex-wrap gap-3">
    <Button type="button" disabled={disabled || exporting || isOpen || event.status !== 'draft'} onClick={() => void run('solve')} className="bg-[#13375e]">
      <Sparkles className="mr-2 h-4 w-4" />{working === 'solve' ? 'Beregner kampforslag…' : 'Algoritme foreslå kampe'}
    </Button>
    <Button type="button" variant="outline" disabled={disabled || exporting || !rows.length} onClick={() => void exportPlan()}>
      {exporting ? 'Eksporterer…' : 'Eksporter kampplan'}
    </Button>
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
      {Object.entries(algorithmWeightDefaults).map(([name, fallback]) => <div key={name} className="min-w-0 space-y-1">
        <div className="flex min-h-9 items-center gap-1">
          <Label className="min-w-0 flex-1 text-[11px] leading-tight [overflow-wrap:anywhere]" htmlFor={`algorithm-${name}`}>{name}</Label>
          <Popover><PopoverTrigger asChild><button type="button" aria-label={`Info om ${name}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#13375e] hover:bg-slate-100 focus-visible:outline-2">
            <Info className="size-4" aria-hidden="true" />
          </button></PopoverTrigger><PopoverContent className="max-w-[calc(100vw-2rem)] text-sm" side="top">
            <p className="mb-1 break-words font-semibold">{name}</p><p>{optimizerHelp[name as keyof AlgorithmWeights]}</p>
          </PopoverContent></Popover>
        </div>
        {name === 'FactorDistanceSameTeamA' ? <select id={`algorithm-${name}`} name={name} disabled={disabled} value={weights[name]}
          className="h-9 w-full rounded-md border bg-white px-2 text-base" onChange={e => {setWeights(current => ({...current, [name]: e.target.value})); setProposal(null); setSaved(false);}}>
          <option value="2">2</option><option value="3">3</option>
        </select> : <Input id={`algorithm-${name}`} name={name} type="number" step={1} min={-1000000} max={1000000} disabled={disabled} className="h-9 px-2 text-base"
          placeholder={String(fallback)} value={weights[name]} onChange={e => {
            const v = e.target.value;
            if (v === '' || /^-?\d+$/.test(v) && Number.isSafeInteger(Number(v))) {
              setWeights(current => ({...current, [name]: v})); setProposal(null); setSaved(false);
            }
          }} onBlur={() => setWeights(current => ({...current, [name]: current[name] === '' ? String(fallback) : current[name]}))} />}
      </div>)}
    </div>
    <p className="text-sm text-slate-600">Vægtene skal være heltal. Tomme felter bruger standardværdien. FactorAge kræver fødselsår på alle tilmeldte medlemmer.</p>
    <p className="text-sm text-slate-600">FactorSameTeamDifference vægter CR-forskellen mellem medspillerne på begge hold. Standardværdien er 15; 0 slår dette fradrag fra. Singlekampe får intet fradrag for denne faktor.</p>
    <p className="text-sm text-slate-600">Første spilletime prioriteres før anden og tredje time for tilmeldte spillere. Derefter prioriteres flere kampe, kampscore og til sidst tidlige tider. Single er tilladt fra kl. 20:30, også på tværs af køn.</p>
    {isOpen && <p className="text-sm text-slate-600">Luk tilmeldingen, før du laver et kampforslag.</p>}
    {event.status !== 'draft' && <p className="text-sm text-slate-600">Der kan kun laves forslag til en kampplan, som er en kladde.</p>}
    {working && <p role="status" className="text-sm">{working === 'solve' ? 'Fordeler timer og optimerer kampe. Beregningen har op til 10 minutter; med opstart kan det tage op til 12 minutter.' : 'Kontrollerer og gemmer kampplanen…'}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="text-sm font-semibold text-[#13375e]">Kampplanen er gemt og vises nedenfor sammen med “Baner, der ikke bruges”. Du kan nu offentliggøre kampplanen.</p>}
    {proposal && <div className="space-y-4">
      <p role="status" className="font-semibold">{proposal.status === 'OPTIMAL' ? 'Optimal løsning fundet' : 'Gyldigt forslag fundet – optimalitet er ikke bevist'} · Samlet score: {proposal.score}</p>
      <p className="text-sm text-slate-600">{proposal.historyDates.length ? `Historik: ${proposal.historyDates.join(', ')}.` : 'Ingen tidligere afholdte runder fra 18. september 2026 er tilgængelige.'} Forslaget er kontrolleret for overlap, baner, tilmeldingstider, timegrænser og spillerkombinationer.</p>
      {!saved && <ImportedPlanTable rows={proposal.rows} />}
      <details open={proposal.allocation.some(p => p.assigned < p.requested)}>
        <summary className="cursor-pointer font-semibold">Fordeling af ønskede timer</summary>
        <p className="my-2 text-sm text-slate-600">Manglende timer er ønsker, som dette forslag ikke opfylder. Hvis optimalitet ikke er bevist, kan en anden løsning muligvis opfylde flere ønsker.</p>
        <ul className="space-y-1 text-sm">{proposal.allocation.slice().sort((a,b) => a.signupOrder - b.signupOrder).map(p => <li key={p.id} className={p.assigned < p.requested ? 'font-semibold text-amber-900' : ''}>
          #{p.signupOrder} · {p.name} ({p.memberNo}){p.status === 'waitlist' ? ' · Venteliste' : ''}: {p.assigned} af {p.requested} timer
        </li>)}</ul>
      </details>
      {!saved && !working && !!proposal.matches.length && <Button disabled={disabled} onClick={() => void run('save')}>Prøv at gemme kampforslaget igen</Button>}
    </div>}
  </section>;
}
