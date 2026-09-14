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

test('ranking is a labelled, required select with exactly the six allowed values', async () => {
  const { RankingField } = await vite.ssrLoadModule('/components/ranking-field.tsx');
  const render = props => renderToStaticMarkup(React.createElement(RankingField, { id: 'ranking', ...props }));
  const html = render({ defaultValue: 'BC' });
  assert.match(html, /<label[^>]*for="ranking"/);
  assert.match(html, /<select[^>]*id="ranking"[^>]*name="level"[^>]*required/);
  assert.deepEqual([...html.matchAll(/<option[^>]*value="([^"]+)"/g)].map(match => match[1]), ['A','AB','B','BC','C','Begynder']);
  assert.match(html, /<option value="BC" selected="">BC<\/option>/);
  assert.doesNotMatch(html, /<input|<datalist/);
  assert.match(render({ defaultValue: 'B+' }), /<option value="AB" selected="">/);
  assert.match(render({ defaultValue: 'ukendt' }), /<option value="Begynder" selected="">/);
  assert.match(render({}), /<option value="Begynder" selected="">/);
});
