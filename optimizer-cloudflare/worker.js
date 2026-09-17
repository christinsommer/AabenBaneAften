import {Container} from '@cloudflare/containers';
import {env} from 'cloudflare:workers';
import {handleRequest} from './handler.js';

export class OptimizerContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '2m';
  enableInternet = false;
  envVars = {OPTIMIZER_API_KEY: env.OPTIMIZER_API_KEY};
}

export default {fetch: handleRequest};
