'use client';

import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { PlayerContact, type PlanContact } from '../components/player-contact';
import type { ReplacementCandidate } from '../lib/replacement-candidates';

export function FindReplacementButton({ candidates }: { candidates: (ReplacementCandidate & {contact: PlanContact})[] }) {
  return <Dialog>
    <DialogTrigger asChild><Button variant="secondary">Find en afløser</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Find en afløser</DialogTitle>
        <DialogDescription>Spillere, som har ønsket flere timer, end de har fået, og som ikke spiller på mindst én af dine tider. Aftal selv afløsningen med spilleren.</DialogDescription>
      </DialogHeader>
      {candidates.length ? <ul className="space-y-3">
        {candidates.map(candidate => <li key={candidate.id} className="rounded-lg border p-3">
          <div className="font-semibold"><PlayerContact name={candidate.name} contact={candidate.contact} /></div>
          <p className="text-sm text-slate-600">Ønsket: {candidate.requested} timer · Tildelt: {candidate.assigned} timer</p>
          <p className="mt-1 text-sm">Ledig på dine tider: {candidate.times.join(', ')}</p>
          {!candidate.contact.email && !candidate.contact.phone && <p className="mt-1 text-xs text-slate-500">Ingen delte kontaktoplysninger.</p>}
        </li>)}
      </ul> : <p className="text-sm text-slate-600">Ingen mulige afløsere fundet. Listen kræver, at du har kampe i kampplanen, og at andre spillere mangler timer og er ledige på dine tider.</p>}
    </DialogContent>
  </Dialog>;
}
