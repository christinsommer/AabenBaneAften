'use client';

import {useEffect, useRef, useState} from 'react';
import {Button} from '../components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '../components/ui/card';
import {ImportedPlanTable} from './imported-plan';
import {editableMatches, proposedMatches, swapPlayerSlots, type EditableMatch, type PlayerSlot, type PlanIssue} from '../lib/plan-review';
import type {AlgorithmWeights, ProposedMatch} from '../lib/optimizer';

type Review = {valid: boolean; issues: PlanIssue[]; exceptions?: PlanIssue[]; scores: (number | null)[]};
type EditContext = Review & {matches: ProposedMatch[]; players: {id: number; name: string}[];
  locked: ProposedMatch[]; weights: AlgorithmWeights; fingerprint: string};
const slotKey = (s: PlayerSlot) => `${s.match}:${s.team}:${s.slot}`;

export function PlanEditor({event, rows, scores, weights, busy, isOpen, refresh, onPendingChange}: {
  event: {id: number; status: string; importedKampplan?: string}; rows: Record<string, unknown>[]; scores?: (number | null)[];
  weights?: AlgorithmWeights; busy: boolean; isOpen: boolean; refresh: () => unknown;
  onPendingChange: (pending: boolean) => void;
}) {
  const [context, setContext] = useState<EditContext | null>(null);
  const [draft, setDraft] = useState<EditableMatch[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PlayerSlot | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{source: PlayerSlot; x: number; y: number; moved: boolean} | null>(null);
  const ignoreClick = useRef(false);
  const pending = draft !== null || working;
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => {e.preventDefault(); e.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  const names = new Map(context?.players.map(p => [p.id, p.name]) ?? []);
  let distanceNames: string[][] = [];
  try { distanceNames = JSON.parse(event.importedKampplan || '[]').map((row: {_manualDistanceNames?: string[]}) => row._manualDistanceNames ?? []); } catch { /* Older imported plan. */ }
  const locked = (index: number) => !!draft && !!context?.locked.some(m => m.court === draft[index].court && m.startTime === draft[index].startTime);
  async function request<T = {ok: boolean}>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch('/api/optimizer', {method:'POST', credentials:'same-origin',
      headers:{'content-type':'application/json'}, signal:AbortSignal.timeout(30_000),
      body:JSON.stringify({action, eventId:event.id, weights:context?.weights ?? weights ?? {}, ...extra})});
    const data = await response.json() as T & {error?: string};
    if (!response.ok) throw new Error(data.error || 'Kampplanen kunne ikke behandles.');
    return data;
  }
  async function begin() {
    if (draft) {setEditing(true); setError(''); return;}
    setWorking(true); setError('');
    try {
      const loaded = await request<EditContext>('edit_context');
      setContext(loaded); setDraft(editableMatches(loaded.matches)); setReview(loaded); setEditing(true);
    } catch (e) {setError(e instanceof Error ? e.message : 'Redigeringen kunne ikke startes.');}
    finally {setWorking(false);}
  }
  async function finish() {
    if (!draft || !context) return;
    setWorking(true); setError(''); setSelected(null); setOver(null);
    try {
      const matches = proposedMatches(draft);
      const checked = await request<Review>('review_edit', {matches, fingerprint:context.fingerprint});
      setReview(checked); setEditing(false);
      if (!checked.valid) return;
      await request('save_edit', {matches, fingerprint:context.fingerprint});
      await refresh();
      setDraft(null); setContext(null); setReview(null);
    } catch (e) {setError(e instanceof Error ? e.message : 'Ændringerne kunne ikke gemmes.');}
    finally {setWorking(false);}
  }
  function swap(from: PlayerSlot, to: PlayerSlot) {
    if (!draft || locked(from.match) || locked(to.match) || slotKey(from) === slotKey(to)) return;
    setDraft(swapPlayerSlots(draft, from, to)); setReview(null); setSelected(null); setOver(null);
  }
  function pick(slot: PlayerSlot) {
    if (!draft || locked(slot.match)) return;
    if (ignoreClick.current) {ignoreClick.current = false; return;}
    if (selected) {if (slotKey(selected) === slotKey(slot)) setSelected(null); else swap(selected, slot);}
    else if (draft[slot.match].teams[slot.team][slot.slot] !== null) setSelected(slot);
  }
  function targetAt(x: number, y: number): PlayerSlot | null {
    const element = document.elementFromPoint(x,y)?.closest('[data-plan-slot]');
    const value = element?.getAttribute('data-plan-slot');
    if (!value) return null;
    const [match, team, slot] = value.split(':').map(Number);
    return {match, team:team as 0|1, slot:slot as 0|1};
  }
  return <section aria-label="Manuel redigering af kampplan" className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={busy || working || event.status !== 'draft' || isOpen}
        onClick={() => void (editing ? finish() : begin())}>
        {working ? 'Kontrollerer…' : editing ? 'Afslut redigering og kontrollér' : draft ? 'Ret kampplanen igen' : 'Redigér kampplan'}
      </Button>
      {draft && <Button type="button" variant="outline" disabled={working} onClick={() => {
        setDraft(null); setContext(null); setReview(null); setEditing(false); setSelected(null); setError('');
      }}>Annuller ændringer</Button>}
    </div>
    {event.status !== 'draft' && <p className="text-sm text-slate-600">Kun kladder kan redigeres.</p>}
    {isOpen && <p className="text-sm text-slate-600">Luk tilmeldingen før redigering.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {editing && <p className="text-sm text-slate-600">Træk en spiller hen på en anden for at bytte plads, eller hen på et tomt felt for at flytte. Du kan også trykke på spilleren og derefter på destinationen, også med tastatur. Låste kampe kan ikke flyttes. Ændringer gemmes først efter kontrol.</p>}
    {!draft ? <ImportedPlanTable rows={rows} scores={scores} distanceNames={distanceNames} /> : <Card className="gap-2 border-[#dce9e1] py-3">
      <CardHeader className="px-3"><CardTitle>Kampplan</CardTitle></CardHeader>
      <CardContent className="px-2 sm:px-3">
        <table className="w-full table-fixed text-left text-sm" aria-label="Kampplan under redigering">
          <colgroup><col className="w-10"/><col className="w-12 sm:w-16"/><col/><col/><col className="w-12"/></colgroup>
          <thead><tr>{['Bane','Tid','Hold 1','Hold 2','Score'].map(label => <th key={label} className="px-1 py-2 text-xs">{label}</th>)}</tr></thead>
          <tbody>{draft.map((match, matchIndex) => <tr key={`${match.court}:${match.startTime}`} className="border-t bg-[#f5f5f3]">
            <td className="px-1 align-middle font-semibold">#{match.court}{locked(matchIndex) && <span className="block text-[10px]">Låst</span>}</td>
            <td className="px-1 text-xs">{match.startTime}</td>
            {match.teams.map((team, teamIndex) => <td key={teamIndex} className="px-1 py-2 align-top">
              {team.map((id, slotIndex) => {
                const slot: PlayerSlot = {match:matchIndex, team:teamIndex as 0|1, slot:slotIndex as 0|1};
                const key = slotKey(slot);
                const violations = review?.issues.filter(i => i.matchIndex === matchIndex && (!i.playerIds.length || id !== null && i.playerIds.includes(id))) ?? [];
                const exceptions = review?.exceptions?.filter(i => i.matchIndex === matchIndex && id !== null && i.playerIds.includes(id)) ?? [];
                const label = id === null ? 'Tom plads' : names.get(id) ?? 'Ukendt spiller';
                return <button key={slotIndex} type="button" data-plan-slot={key}
                  disabled={!editing || working || locked(matchIndex)} aria-pressed={selected ? slotKey(selected) === key : false}
                  aria-label={`${label}, bane ${match.court}, kl. ${match.startTime}, hold ${teamIndex+1}, plads ${slotIndex+1}${violations.length ? '. ' + violations.map(i=>i.message).join(' ') : ''}`}
                  title={[...violations, ...exceptions].map(i=>i.message).join('\n')}
                  className={`my-1 min-h-11 w-full rounded border px-1 py-1 text-left text-xs font-semibold [overflow-wrap:anywhere] disabled:opacity-100 ${violations.length ? 'text-red-700 border-red-300' : exceptions.length ? 'text-green-700 border-green-300' : 'text-[#1f2937] border-transparent'} ${selected && slotKey(selected) === key || over === key ? 'ring-2 ring-blue-600 bg-blue-50' : ''} ${editing && !locked(matchIndex) ? 'touch-none cursor-grab bg-white' : ''}`}
                  onClick={() => pick(slot)} onKeyDown={e => {if (e.key === 'Escape') {setSelected(null); setOver(null);}}}
                  onPointerDown={e => {
                    ignoreClick.current = false;
                    if (e.button !== 0 || id === null) return;
                    drag.current = {source:slot, x:e.clientX, y:e.clientY, moved:false};
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }} onPointerMove={e => {
                    if (!drag.current) return;
                    if (Math.hypot(e.clientX-drag.current.x,e.clientY-drag.current.y) > 6) drag.current.moved = true;
                    if (!drag.current.moved) return;
                    setSelected(drag.current.source);
                    const target = targetAt(e.clientX,e.clientY); setOver(target && !locked(target.match) ? slotKey(target) : null);
                    if (e.clientY < 70) window.scrollBy(0,-20);
                    else if (e.clientY > window.innerHeight-70) window.scrollBy(0,20);
                  }} onPointerUp={e => {
                    const current = drag.current; drag.current = null;
                    if (current?.moved) {
                      ignoreClick.current = true;
                      const target = targetAt(e.clientX,e.clientY); if (target) swap(current.source,target);
                      setOver(null);
                    }
                  }} onPointerCancel={() => {drag.current=null; setOver(null); setSelected(null);}}>
                  {label}{violations.length > 0 && <span className="sr-only"> – regelbrud</span>}{!violations.length && exceptions.length > 0 && <span className="sr-only"> – tilladt manuel undtagelse for CR-afstand mellem makkere</span>}
                </button>;
              })}
            </td>)}
            <td className="px-1 text-xs font-semibold">{review?.scores[matchIndex] ?? '–'}</td>
          </tr>)}</tbody>
        </table>
        {!!review?.exceptions?.length && <p className="mt-2 text-xs text-green-700">Grønne navne: CR-afstanden mellem makkere overskrides som en tilladt manuel undtagelse. Andre regelbrud markeres fortsat rødt.</p>}
        {!editing && review && !review.valid && <div role="alert" className="mt-3 text-sm text-red-700">
          <p className="font-semibold">Ændringerne er ikke gemt. Ret de røde spillere og kontrollér igen.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{review.issues.map((issue,index) => <li key={index}>
            {issue.matchIndex >= 0 ? `Bane ${draft[issue.matchIndex].court}, kl. ${draft[issue.matchIndex].startTime}: ` : ''}
            {issue.playerIds.map(id=>names.get(id) ?? 'Ukendt spiller').join(', ')}{issue.playerIds.length ? ' – ' : ''}{issue.message}
          </li>)}</ul>
        </div>}
      </CardContent>
    </Card>}
  </section>;
}
