import {Container} from '@cloudflare/containers';
import {env, WorkflowEntrypoint} from 'cloudflare:workers';
import {handleRequest} from './handler.js';
import {recoverJobs, runOptimizerJob} from './jobs.js';

export class OptimizerContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '2m';
  enableInternet = false;
  envVars = {OPTIMIZER_API_KEY: env.OPTIMIZER_API_KEY};
}

export class OptimizerWorkflow extends WorkflowEntrypoint {
  async run(event, step) { await runOptimizerJob(this.env,event.payload.id,step); }
}

export default {fetch: handleRequest, async scheduled(_event, env) { await recoverJobs(env); }};
