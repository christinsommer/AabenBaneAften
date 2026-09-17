'use client';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { normalizeKampplanRows } from '../lib/kampplan-rows';
import { MatchCalendarButton } from '../components/match-calendar-button';
import type { CalendarPlayer } from '../lib/match-calendar';

export function ImportedPlanTable({ rows, scores, calendarDate, calendarPlayers = [] }: { rows: Record<string, unknown>[]; scores?: (number | null)[]; calendarDate?: string; calendarPlayers?: CalendarPlayer[] }) {
  rows = normalizeKampplanRows(rows);
  const value = (row: Record<string, unknown>, key: string) => String(row[key] ?? '').trim();
  return <Card className="min-w-0 gap-2 border-[#dce9e1] py-3">
    <CardHeader className="px-3 pb-0"><CardTitle>Kampplan</CardTitle></CardHeader>
    <CardContent className="min-w-0 px-2 sm:px-3">
      {!rows.length ? <p className="py-3 text-sm text-slate-500">Der er ingen kampe til dig i kampplanen.</p> :
        <table className="w-full table-fixed text-left text-sm" aria-label="Kampplan">
          <colgroup>
            <col className="w-9 sm:w-12" />
            <col className="w-12 sm:w-28" />
            <col />
            <col />
            {scores && <col className="w-12" />}
            {calendarDate && <col className="w-11" />}
          </colgroup>
          <thead><tr className="border-b text-xs text-slate-500">
            {['Bane', 'Tid', 'Hold 1', 'Hold 2'].map(header => <th key={header} scope="col" className="px-1 py-1 font-medium sm:px-2">{header}</th>)}
            {scores && <th scope="col" className="px-1 py-1 font-medium">Score</th>}
            {calendarDate && <th scope="col"><span className="sr-only">Kalender</span></th>}
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-b bg-[#f5f5f3] last:border-0">
            <>
              <td className="break-words px-1 py-2 align-middle font-bold text-[#13375e] sm:px-2">#{value(row, 'C').match(/\d+/)?.[0] ?? value(row, 'C')}</td>
              <td className="px-1 py-2 align-middle text-xs font-semibold text-[#13375e] sm:px-2">
                <span className="block sm:inline">{value(row, 'A')}</span><span className="sr-only sm:not-sr-only">–</span><span className="block sm:inline">{value(row, 'B')}</span>
              </td>
              {[['D', 'E'], ['F', 'G']].map((keys, team) => <td key={team} className="px-1 py-2 align-middle sm:px-2">
                {keys.map(key => <p key={key} className="whitespace-normal text-xs font-semibold leading-5 text-[#1f2937] [overflow-wrap:anywhere] [&+p]:mt-1">{value(row, key)}</p>)}
              </td>)}
              {scores && <td className="px-1 py-2 text-xs font-semibold" title={scores[index] == null ? 'Score kan ikke beregnes med de tilgængelige medlems- og historikoplysninger.' : undefined}>{scores[index] ?? '–'}</td>}
              {calendarDate && <td className="px-1 py-2 align-middle"><MatchCalendarButton match={{
                date: calendarDate, startTime: value(row, 'A'), endTime: value(row, 'B'),
                court: value(row, 'C'), players: ['D', 'E', 'F', 'G'].map(key => {
                  const name = value(row, key);
                  const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
                  return calendarPlayers.find(player => normalize(player.name) === normalize(name)) ?? name;
                }),
              }} /></td>}
            </>
          </tr>)}</tbody>
        </table>}
      {scores && <p className="mt-2 text-xs text-slate-500">Score bruger faktorværdierne fra kampplanens beregning. Importerede planer uden gemte faktorer bruger standardværdierne.</p>}
    </CardContent>
  </Card>;
}
