/**
 * Local compatibility stub.
 * This project is now a standard Next.js app and not dependent on Cloudflare Workers.
 */

export default {
  async fetch() {
    return new Response("This app is running locally on Next.js.", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
