import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import {securityHeaders} from './lib/security-headers';

initOpenNextCloudflareForDev({ persist: { path: ".wrangler/local-dev/v3" } });

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {root: process.cwd()},
  async headers(){return [
    {source:'/:path*',headers:securityHeaders},
    {source:'/newsletter',headers:[{key:'Cache-Control',value:'no-store'}]},
    {source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'},{key:'Content-Security-Policy',value:"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}]},
  ];},
};

export default nextConfig;
