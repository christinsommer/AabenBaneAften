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

test('manual distance exceptions are green only in the admin table', async () => {
  const { ImportedPlanTable } = await vite.ssrLoadModule('/app/imported-plan.tsx');
  const render = props => renderToStaticMarkup(React.createElement(ImportedPlanTable, props));
  const rows=[{...row,_manualDistanceNames:[row.D,row.E]}];
  assert.doesNotMatch(render({rows}),/text-green-700|Tilladt manuel/);
  const admin=render({rows,distanceNames:[[row.D,row.E]]});
  assert.equal((admin.match(/title="Tilladt manuel/g) ?? []).length,2);
  assert.match(admin,/text-green-700/);
});

test('per-match scores appear only when the admin explicitly enables them', async () => {
  const { ImportedPlanTable } = await vite.ssrLoadModule('/app/imported-plan.tsx');
  const render = props => renderToStaticMarkup(React.createElement(ImportedPlanTable, props));
  assert.doesNotMatch(render({rows:[{...row,_optimizerScore:-150}]}),/>Score</);
  const html=render({rows:[row],scores:[-150]});
  assert.match(html,/>Score</);
  assert.match(html,/>-150</);
  assert.doesNotMatch(render({rows:[row],calendarDate:'2026-09-18'}),/>Score</);
});

test('optimizer keeps admin actions while factor inputs belong to the SuperAdmin form', async () => {
  const {OptimizerPanel}=await vite.ssrLoadModule('/app/optimizer-panel.tsx');
  const {OptimizerDefaultsForm}=await vite.ssrLoadModule('/app/optimizer-defaults-form.tsx');
  const {algorithmWeightDefaults}=await vite.ssrLoadModule('/lib/optimizer.ts');
  const panel=renderToStaticMarkup(React.createElement(OptimizerPanel,{event:{id:1,date:'2026-09-18',status:'draft'},rows:[],wishes:[],busy:false,isOpen:false,refresh:()=>{},clearPlan:async()=>true}));
  assert.match(panel,/Algoritme foreslå kampe/);
  assert.match(panel,/Eksporter kampplan/);
  for(const name of Object.keys(algorithmWeightDefaults)) assert.ok(!panel.includes(name));
  const descriptions=Object.fromEntries(Object.keys(algorithmWeightDefaults).map(name=>[name,`Help for ${name}`]));
  const html=renderToStaticMarkup(React.createElement(OptimizerDefaultsForm,{defaults:{...algorithmWeightDefaults,FactorSingle:50,FactorDistanceSameTeamA:2},descriptions,act:async()=>true,busy:false}));
  assert.match(html,/grid-cols-2/);
  assert.match(html,/FactorDistanceSameTeamA<\/span><input[^>]*step="1"[^>]*value="2"/);
  assert.match(html,/FactorSingle<\/span><input[^>]*value="50"/);
  assert.match(html,/FactorOpponentThisWeek<\/span><input[^>]*value="5"/);
  for(const name of Object.keys(algorithmWeightDefaults)) assert.ok(html.includes(descriptions[name]));
});

test('admin settings render the configurable weekly opponent default', async () => {
  const {OptimizerDefaultsForm}=await vite.ssrLoadModule('/app/optimizer-defaults-form.tsx');
  const {algorithmWeightDefaults}=await vite.ssrLoadModule('/lib/optimizer.ts');
  const html=renderToStaticMarkup(React.createElement(OptimizerDefaultsForm,{defaults:{...algorithmWeightDefaults,FactorOpponentThisWeek:17},act:async()=>true,busy:false}));
  assert.match(html,/FactorOpponentThisWeek<\/span><input[^>]*value="17"/);
});

test('admin court settings show both named orders and their defaults', async () => {
  const {CourtOrderForm}=await vite.ssrLoadModule('/app/court-order-form.tsx');
  const html=renderToStaticMarkup(React.createElement(CourtOrderForm,{act:async()=>true,busy:false}));
  assert.match(html,/Hele timer rækkefølge/);
  assert.match(html,/Halve timer rækkefølge/);
  assert.match(html,/value="4, 3, 2, 1"/);
  assert.match(html,/value="5, 6, 7"/);
});

test('admin start-time settings render both configurable summer time groups', async () => {
  const {PlayTimesForm}=await vite.ssrLoadModule('/app/play-times-form.tsx');
  const html=renderToStaticMarkup(React.createElement(PlayTimesForm,{defaults:{whole:['17:00','18:00'],half:['17:30','18:30']},act:async()=>true,busy:false}));
  assert.match(html,/Hele timer tider/);
  assert.match(html,/Halve timer tider/);
  assert.match(html,/value="17:00, 18:00"/);
  assert.match(html,/value="17:30, 18:30"/);
});

test('signup edit trigger is labelled for its member and disabled for historical rounds', async () => {
  const {EditSignupButton}=await vite.ssrLoadModule('/app/edit-signup-button.tsx');
  const props={signup:{id:1,requestedHours:1,availability:'["18:00","19:00"]',status:'active'},eventId:1,name:'Anne Jensen',times:['18:00','19:00'],busy:false,disabled:false,act:async()=>true};
  const html=renderToStaticMarkup(React.createElement(EditSignupButton,props));
  assert.match(html,/aria-label="Rediger tilmelding for Anne Jensen"/);
  assert.match(html,/aria-haspopup="dialog"/);
  assert.doesNotMatch(html,/disabled=""/);
  assert.doesNotMatch(html,/>Rediger</);
  assert.match(renderToStaticMarkup(React.createElement(EditSignupButton,{...props,disabled:true})),/disabled=""/);
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
