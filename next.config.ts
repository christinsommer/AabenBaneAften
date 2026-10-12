import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev({ persist: { path: ".wrangler/local-dev/v3" } });

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {root: process.cwd()},
  async headers(){return [{source:'/newsletter',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'no-store'}]}];},
};

export default nextConfig;
