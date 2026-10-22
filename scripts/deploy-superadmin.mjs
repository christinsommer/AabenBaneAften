import {spawnSync} from 'node:child_process';

const [mode, member] = process.argv.slice(2);
if (!['check', 'apply'].includes(mode) || (member !== undefined && !/^\d+$/.test(member)) || process.argv.length > 4) throw new Error('Usage: deploy-superadmin.mjs check|apply [member-number]');
function wrangler(args, input) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    encoding: 'utf8', input, windowsHide: true, timeout: 120000,
    env: {...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false'},
  });
  if (result.error || result.status !== 0) throw new Error(`Cloudflare ${args[0]} failed: ${result.stderr}`, {cause: result.error});
  return result.stdout;
}
const secrets = JSON.parse(wrangler(['secret', 'list', '--config', 'wrangler.jsonc']));
if (!member) {
  if (!secrets.some(secret => secret.name === 'SUPERADMIN_PLAYER_ID')) throw new Error('SUPERADMIN_PLAYER_ID is missing. Run Deploy.ps1 -SuperAdminMemberNo <verified member number>.');
  console.log('Production SUPERADMIN_PLAYER_ID secret exists; existing account binding preserved.');
} else {
  const tables = JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--command', "SELECT name FROM sqlite_master WHERE type='table' AND name='profile_privacy'", '--json']));
  const hasPrivacy = tables[0]?.results?.length === 1;
  const query = hasPrivacy
    ? `SELECT p.id, p.role, pp.closed_at FROM players p LEFT JOIN profile_privacy pp ON pp.player_id=p.id WHERE p.member_no='${member}'`
    : `SELECT id, role, NULL AS closed_at FROM players WHERE member_no='${member}'`;
  const result = JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--command', query, '--json']));
  const rows = result[0]?.results;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].role !== 'admin' || rows[0].closed_at !== null || !Number.isSafeInteger(rows[0].id) || rows[0].id < 1) throw new Error('Requested production member is not a unique open administrator.');
  console.log(`Verified production administrator: member ${member}, internal ID ${rows[0].id}.`);
  if (mode === 'apply') {
    wrangler(['secret', 'bulk', '--config', 'wrangler.jsonc'], JSON.stringify({SUPERADMIN_PLAYER_ID: String(rows[0].id)}));
    console.log('Production SUPERADMIN_PLAYER_ID configured.');
  }
}
