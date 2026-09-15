import {spawnSync} from 'node:child_process';
import {mkdirSync, existsSync, readFileSync, appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';

const mode = process.argv[2] ?? 'test';
if (!['build','test','start'].includes(mode)) throw new Error('Use build, test or start.');
const env = {...process.env, DOTNET_CLI_HOME:resolve('optimizer-service/.dotnet'), NUGET_PACKAGES:resolve('optimizer-service/.nuget'), DOTNET_CLI_TELEMETRY_OPTOUT:'1'};
if (mode === 'start') {
  const local = existsSync('.dev.vars') ? readFileSync('.dev.vars','utf8') : '';
  const setting = name => local.match(new RegExp(`^${name}\\s*=\\s*(.+)$`,'m'))?.[1].trim().replace(/^['"]|['"]$/g,'');
  env.OPTIMIZER_API_KEY = setting('OPTIMIZER_API_KEY') || env.OPTIMIZER_API_KEY || randomBytes(32).toString('hex');
  if (!setting('OPTIMIZER_API_KEY')) appendFileSync('.dev.vars', `\nOPTIMIZER_API_KEY=${env.OPTIMIZER_API_KEY}\n`);
  if (!setting('OPTIMIZER_URL')) appendFileSync('.dev.vars', '\nOPTIMIZER_URL=http://127.0.0.1:5117\n');
  console.log('Local optimizer configuration is in .dev.vars. Restart the app after changing it.');
}
mkdirSync(env.DOTNET_CLI_HOME,{recursive:true});
function run(args) {
  const result=spawnSync('dotnet',args,{env,stdio:'inherit',windowsHide:true});
  if(result.error) throw new Error('Installér .NET 10 SDK for at bygge og teste beregningstjenesten.',{cause:result.error});
  if(result.status !== 0) process.exit(result.status ?? 1);
}
run(['restore','optimizer-service/OptimizerService.csproj','--locked-mode']);
run(['build','optimizer-service/OptimizerService.csproj','--no-restore']);
if(mode==='test') run(['optimizer-service/bin/Debug/net10.0/OptimizerService.dll','--self-test']);
if(mode==='start') run(['optimizer-service/bin/Debug/net10.0/OptimizerService.dll','--urls','http://127.0.0.1:5117']);
