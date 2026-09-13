'use client';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { normalizeKampplanRows } from '../lib/kampplan-import';

export function ImportedPlanTable({ rows }: { rows: Record<string, unknown>[] }) {
  rows = normalizeKampplanRows(rows);
  const value = (row: Record<string, unknown>, key: string) => String(row[key] ?? '').trim();
  return <Card className="gap-2 border-[#dce9e1] py-3">
    <CardHeader className="px-3 pb-0"><CardTitle>Kampplan</CardTitle></CardHeader>
    <CardContent className="overflow-x-auto px-3">
      {!rows.length ? <p className="py-3 text-sm text-slate-500">Der er ingen kampe til dig i kampplanen.</p> :
        <table className="w-full text-left text-sm" aria-label="Kampplan">
          <thead><tr className="border-b text-xs text-slate-500">
            {['Bane', 'Tid', 'Hold 1', 'Hold 2'].map(header => <th key={header} className="px-2 py-1 font-medium">{header}</th>)}
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-b bg-[#f5f5f3] last:border-0">
            <>
              <td className="whitespace-nowrap px-2 py-2 align-middle font-bold text-[#13375e]">Bane {value(row, 'C').match(/\d+/)?.[0] ?? value(row, 'C')}</td>
              <td className="whitespace-nowrap px-2 py-2 align-middle text-xs font-semibold text-[#13375e]">{value(row, 'A')}–{value(row, 'B')}</td>
              {[['D', 'E'], ['F', 'G']].map((keys, team) => <td key={team} className="px-2 py-2 align-middle">
                {keys.map(key => <p key={key} className="whitespace-nowrap text-xs font-semibold leading-5 text-[#1f2937]">{value(row, key)}</p>)}
              </td>)}
            </>
          </tr>)}</tbody>
        </table>}
    </CardContent>
  </Card>;
}
