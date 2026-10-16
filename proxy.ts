import {NextRequest, NextResponse} from 'next/server';
import {contentSecurityPolicy} from './lib/security-headers';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  // Always replace incoming values: the requester cannot choose the nonce/policy.
  headers.set('x-nonce',nonce);
  headers.set('Content-Security-Policy',policy);
  const response = NextResponse.next({request:{headers}});
  response.headers.set('Content-Security-Policy',policy);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api(?:/|$)|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest)$).*)'],
};
