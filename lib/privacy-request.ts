export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const site=request.headers.get('sec-fetch-site');
  const mediaType=(request.headers.get('content-type')??'').split(';',1)[0].trim().toLowerCase();
  return (!origin||origin===new URL(request.url).origin)&&(!site||site==='same-origin')&&mediaType==='application/json';
}
