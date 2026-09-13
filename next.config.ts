import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev({ persist: { path: ".wrangler/local-dev/v3" } });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
