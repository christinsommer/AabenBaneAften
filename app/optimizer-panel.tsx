'use client';

import {useState} from 'react';
import {Sparkles} from 'lucide-react';
import {Button} from '../components/ui/button';
import {ImportedPlanTable} from './imported-plan';
import type {AlgorithmWeights, ProposedMatch} from '../lib/optimizer';
import type {UnfulfilledWish} from '../lib/unfulfilled-wishes';

type Proposal = {
  matches: ProposedMatch[]; rows: Record<string, string>[]; score: number; status: string; fingerprint: string;
  weights?: AlgorithmWeights; historyDates: string[];
  allocation: {id: number; name: string; memberNo: string; signupOrder: number; status: string; requested: number; assigned: number}[];
};
export function OptimizerPanel({event, rows, wishes, isOpen, busy, refresh, clearPlan}: {
  clearPlan: () => Promise<boolean>;
  wishes: UnfulfilledWish[];
  event: {id: number; status: string; date: string}; rows: Record<string, unknown>[]; isOpen: boolean; busy: boolean; refresh: () => unknown;
}) {
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
          signal: AbortSignal.timeout(1_020_000), body: JSON.stringify({...body, eventId: event.id})});
        const data = await response.json() as Proposal & {error?: string};
        if (!response.ok) throw new Error(data.error || 'Forslaget kunne ikke behandles.');
        return data;
      }
      if (action === 'solve' && !await clearPlan()) throw new Error('Kampplanen kunne ikke fjernes.');
      const result = action === 'solve' ? await request({action: 'solve',
      }) : proposal!;
      setProposal(result);
      if (!result.matches.length) throw new Error('Der blev ikke fundet nogen kampe. Den tidligere kampplan er fjernet.');
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
    <Button type="button" disabled={disabled || exporting || isOpen} onClick={() => void run('solve')} className="bg-[#13375e]">
      <Sparkles className="mr-2 h-4 w-4" />{working === 'solve' ? 'Beregner kampforslag…' : 'Algoritme foreslå kampe'}
    </Button>
    <Button type="button" variant="outline" disabled={disabled || exporting || !rows.length} onClick={() => void exportPlan()}>
      {exporting ? 'Eksporterer…' : 'Eksporter kampplan'}
    </Button>
    </div>
    <p className="text-sm text-slate-600">Første spilletime prioriteres før anden og tredje time for tilmeldte spillere. Derefter prioriteres flere kampe, kampscore og til sidst tidlige tider. Single er tilladt fra kl. 20:30, også på tværs af køn.</p>
    {isOpen && <p className="text-sm text-slate-600">Luk tilmeldingen, før du laver et kampforslag.</p>}

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
