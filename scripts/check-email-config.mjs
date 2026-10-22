import {spawnSync} from 'node:child_process';

const result = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'secret', 'list', '--config', 'wrangler.jsonc',
], {
  encoding: 'utf8', windowsHide: true, timeout: 120000,
  env: {...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false'},
});
if (result.error || result.status !== 0) throw new Error('Could not check production email configuration. ' + result.stderr);
if (!JSON.parse(result.stdout).some(secret => secret.name === 'RESEND_API_KEY')) {
  throw new Error('Production is missing RESEND_API_KEY: PIN reset and other emails cannot be sent. Add a Resend sending key using: node node_modules/wrangler/bin/wrangler.js secret put RESEND_API_KEY --config wrangler.jsonc. See docs/email-delivery.md. No production data has been changed.');
}
console.log('Production email secret exists (key validity and delivery not checked).');
