export async function handleRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (!((path === '/solve' && request.method === 'POST') || (path === '/health' && request.method === 'GET'))) {
    return new Response('Not found', {status:404});
  }
  if (!env.OPTIMIZER_API_KEY || env.OPTIMIZER_API_KEY.length < 32) return new Response('Service not configured', {status:503});
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [expected, actual] = await Promise.all([
    digest(`Bearer ${env.OPTIMIZER_API_KEY}`), digest(request.headers.get('authorization') ?? ''),
  ]);
  const expectedBytes = new Uint8Array(expected), actualBytes = new Uint8Array(actual);
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i++) difference |= expectedBytes[i] ^ actualBytes[i];
  if (difference !== 0) return new Response('Unauthorized', {status:401});
  // Authenticate before touching the binding, so anonymous traffic cannot start a VM.
  return env.OPTIMIZER.getByName('main').fetch(request);
}
