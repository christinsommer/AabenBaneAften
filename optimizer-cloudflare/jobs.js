import {finishOptimizerJob} from '../lib/optimizer-job-core.ts';

export async function dispatchJob(env, id) {
  try { await env.OPTIMIZER_JOBS.create({id,params:{id}}); }
  catch(error) {
    // Creation may already have succeeded before the response was lost.
    const instance = await env.OPTIMIZER_JOBS.get(id);
    const status = await instance.status();
    if (!status || status.status === 'unknown') throw error;
  }
}

export async function recoverJobs(env) {
  await env.DB.prepare("UPDATE optimizer_jobs SET status='failed',snapshot='',error=?,finished_at=? WHERE status IN ('queued','running') AND created_at < ?")
    .bind('Beregningen overskred tidsgrænsen. Start en ny beregning.',new Date().toISOString(),new Date(Date.now()-2*3600000).toISOString()).run();
  // Durable outbox: starting the job does not depend on the browser receiving a reply.
  const pending = await env.DB.prepare("SELECT id FROM optimizer_jobs WHERE status='queued' ORDER BY created_at LIMIT 10").all();
  for (const job of pending.results) {
    try { await dispatchJob(env,job.id); }
    catch { console.error('optimizer_dispatch_failed',{id:job.id}); }
  }
  await env.DB.prepare("DELETE FROM optimizer_jobs WHERE status IN ('completed','failed') AND finished_at < ?")
    .bind(new Date(Date.now()-30*86400000).toISOString()).run();
}

export async function runOptimizerJob(env, id, step) {
  try {
    // Snapshot stays in D1, not in Workflow parameters or step output.
    const result = await step.do('calculate', {timeout:'20 minutes',retries:{limit:2,delay:'30 seconds',backoff:'exponential'}},async()=>{
      const job = await env.DB.prepare('SELECT snapshot,status FROM optimizer_jobs WHERE id=?').bind(id).first();
      if (!job || !['queued','running'].includes(job.status)) return null;
      await env.DB.prepare("UPDATE optimizer_jobs SET status='running' WHERE id=? AND status='queued'").bind(id).run();
      const {input} = JSON.parse(job.snapshot);
      const response = await env.OPTIMIZER.getByName('main').fetch(new Request('https://optimizer/solve',{
        method:'POST',headers:{authorization:`Bearer ${env.OPTIMIZER_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify(input),signal:AbortSignal.timeout(1_080_000),
      }));
      if (!response.ok) {
        const body = await response.json().catch(()=>null);
        const detail = typeof body?.error === 'string' ? body.error.trim().slice(0,1000) : '';
        const message = `Beregningstjenesten afviste beregningen (HTTP ${response.status}).${detail ? ` ${detail}` : ''}`;
        // Persist deterministic rejections as step output so Workflow retries and
        // restarts cannot replace the service's explanation with a generic error.
        if (response.status >= 400 && response.status < 500 && ![408,429].includes(response.status)) return {failure:message};
        throw new Error(message);
      }
      const solved = await response.json();
      if (input.optimizerPriorities && solved.priorityProtocol !== 1)
        return {failure:'Beregningstjenesten skal opdateres for at bruge den konfigurerede prioritering.'};
      return solved;
    });
    if (result?.failure) throw new Error(result.failure);
    if (result) await step.do('save draft',{retries:{limit:5,delay:'10 seconds',backoff:'exponential'}},()=>finishOptimizerJob(env.DB,id,result));
  } catch (error) {
    const detail = typeof error?.message === 'string' ? error.message.trim().slice(0,1500) : '';
    await step.do('record failure',async()=>{
      await env.DB.prepare("UPDATE optimizer_jobs SET status='failed',snapshot='',error=?,finished_at=? WHERE id=? AND status IN ('queued','running')")
        .bind(detail || 'Beregningen kunne ikke fuldføres efter flere forsøg. Start en ny beregning.',new Date().toISOString(),id).run();
    });
  }
}
