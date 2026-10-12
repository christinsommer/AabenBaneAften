export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const site=request.headers.get('sec-fetch-site');
  return (!origin||origin===new URL(request.url).origin)&&site!=='cross-site'&&(request.headers.get('content-type')??'').startsWith('application/json');
}
