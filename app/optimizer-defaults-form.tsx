'use client';

import {useState} from 'react';
import {Card, CardHeader, CardTitle, CardDescription, CardContent} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {algorithmWeightDefaults, parseAlgorithmWeights, type AlgorithmWeights} from '../lib/optimizer';
import {optimizerHelp, weightFields} from '../lib/optimizer-settings';

export function OptimizerDefaultsForm({defaults = algorithmWeightDefaults, act, busy}: {
  defaults?: AlgorithmWeights; act: (body: Record<string, unknown>) => Promise<boolean>; busy: boolean;
}) {
  const [values, setValues] = useState(() => weightFields(defaults));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  return <Card className="border-[#dce9e1]">
    <CardHeader><CardTitle>Standard for kampplan</CardTitle><CardDescription>Faktorerne bruges som udgangspunkt hver uge under Kampplan Admin.</CardDescription></CardHeader>
    <CardContent><form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setError(''); setSaved(false);
      try {
        const weights = parseAlgorithmWeights(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? '' : Number(value)])));
        if (await act({action:'set_optimizer_defaults', weights})) setSaved(true);
      } catch (e) { setError(e instanceof Error ? e.message : 'Kontrollér faktorerne.'); }
    }}>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {Object.keys(algorithmWeightDefaults).map(key => <label key={key} className="grid gap-1 text-sm">
          <span className="font-medium">{key}</span>
          {<input className="h-10 rounded-md border px-3" type="number" step="1" min="-1000000" max="1000000" value={values[key]} onChange={e => {setValues({...values, [key]:e.target.value});setSaved(false);}} />}
          <span className="text-xs text-slate-600">{optimizerHelp[key as keyof AlgorithmWeights]}</span>
        </label>)}
      </fieldset>
      <Button disabled={busy} className="bg-[#13375e]">Gem standardværdier</Button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved && <p role="status">Standardværdierne er gemt.</p>}
    </form></CardContent>
  </Card>;
}
