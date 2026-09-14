import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ appType: 'custom', configFile: false, root,
  resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());

const row = { A: '18.30', B: '19.30', C: 'Bane 3', D: 'Søren Jensen', E: 'Anne Hansen', F: 'Bo Nielsen', G: 'Ida Larsen' };

test('imported table renders one accessible calendar button per match only when enabled', async () => {
  const { ImportedPlanTable } = await vite.ssrLoadModule('/app/imported-plan.tsx');
  const render = props => renderToStaticMarkup(React.createElement(ImportedPlanTable, props));
  const rows = [row, { ...row, A: '19.30', B: '20.30' }];
  assert.doesNotMatch(render({ rows }), /Tilføj kampen/);
  const html = render({ rows, calendarDate: '2026-09-18' });
  assert.equal((html.match(/title="Tilføj til din kalender"/g) ?? []).length, 2);
  assert.match(html, /aria-label="Tilføj kampen kl. 18.30 på bane 3 til din kalender"/);
  assert.doesNotMatch(render({ rows: [], calendarDate: '2026-09-18' }), /Tilføj kampen/);
});

test('click downloads a calendar file containing the selected match', async (t) => {
  const { MatchCalendarButton } = await vite.ssrLoadModule('/components/match-calendar-button.tsx');
  let downloadedBlob, clicked = false, removed = false, revoke;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => link, body: { appendChild() {} } };
  t.after(() => { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  t.mock.method(URL, 'createObjectURL', blob => { downloadedBlob = blob; return 'blob:calendar-test'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'setTimeout', callback => { revoke = callback; });
  const button = MatchCalendarButton({ match: { date: '2026-09-18', startTime: '18:30', court: 3,
    players: [row.D, row.E, row.F, row.G] } });
  button.props.onClick();
  assert.equal(clicked, true);
  assert.equal(removed, true);
  assert.equal(link.download, 'hik-kamp-2026-09-18-1830.ics');
  assert.equal(link.href, 'blob:calendar-test');
  assert.equal(downloadedBlob.type, 'text/calendar;charset=utf-8');
  assert.match(await downloadedBlob.text(), /SUMMARY:Søren & Anne vs Bo & Ida/);
  revoke();
  assert.equal(URL.revokeObjectURL.mock.calls[0].arguments[0], 'blob:calendar-test');
});
