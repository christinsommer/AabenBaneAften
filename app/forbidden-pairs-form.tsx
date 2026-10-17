'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {parseForbiddenPairs, type ForbiddenPair} from '../lib/forbidden-pairs';

export function ForbiddenPairsForm({pairs, members, act, busy}: {
  pairs: ForbiddenPair[];
  members: {memberNo: string; name: string}[];
  act: (body: Record<string, unknown>) => Promise<unknown>;
  busy: boolean;
}) {
  const [rows, setRows] = useState<ForbiddenPair[]>(pairs);
  const [message, setMessage] = useState('');
  const sorted = [...members].sort((a,b) => a.name.localeCompare(b.name, 'da'));
  return <section className="rounded-xl border p-4 space-y-4" aria-label="Spillerpar som ikke må dele bane">
    <h3 className="text-xl font-bold">Spillere som ikke må spille på samme bane</h3>
    <p>Disse par må hverken være makkere eller modspillere i samme kamp. Reglerne gælder for klubbens kampplaner.</p>
    {rows.map((pair,index) => <div key={index} className="flex flex-wrap gap-2">
      {pair.map((value,side) => <label key={side} className="flex min-w-0 flex-1 flex-col gap-1">Medlem {side+1}
        <select className="min-w-0 rounded border p-2" aria-label={`Par ${index+1}, medlem ${side+1}`} value={value} disabled={busy}
          onChange={e => {setMessage(''); setRows(rows.map((row,i) => i === index ? row.map((v,s) => s === side ? e.target.value : v) as ForbiddenPair : row));}}>
          <option value="">Vælg medlem</option>
          {value && !members.some(m => m.memberNo === value) && <option value={value}>Ukendt medlem ({value})</option>}
          {sorted.map(m => <option key={m.memberNo} value={m.memberNo}>{m.name} ({m.memberNo})</option>)}
        </select>
      </label>)}
      <Button variant="outline" disabled={busy} onClick={() => {setRows(rows.filter((_,i) => i !== index)); setMessage('');}}>Fjern par {index+1}</Button>
    </div>)}
    {!rows.length && <p>Ingen spillerpar er begrænset.</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => {setRows([...rows,['','']]); setMessage('');}}>Tilføj spillerpar</Button>
      <Button disabled={busy} onClick={async () => {
        try {const parsed = parseForbiddenPairs(rows); await act({action:'set_forbidden_pairs',pairs:parsed});}
        catch(error) {setMessage(error instanceof Error ? error.message : 'Kunne ikke gemme listen.');}
      }}>Gem spillerpar</Button>
    </div>
    <p role="status">{JSON.stringify(rows) === JSON.stringify(pairs) ? 'Listen er gemt.' : 'Ændringerne er ikke gemt endnu.'}</p>
    {message && <p role="alert">{message}</p>}
  </section>;
}
