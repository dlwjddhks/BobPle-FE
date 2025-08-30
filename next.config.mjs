/** @type {import('next').NextConfig} */
const PROXY_PREFIX = process.env.PROXY_PREFIX || "/_be";

export default {
  async rewrites() {
    if (process.env.PROXY_MODE !== "true") return [];
    const be = (process.env.BE_ORIGIN || "https://bobple-be.onrender.com").replace(/\/$/, "");
    // FE: /_be/...  -> BE: /...
    return [{ source: `${PROXY_PREFIX}/:path*`, destination: `${be}/:path*` }];
  },
};
