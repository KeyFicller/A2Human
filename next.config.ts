import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [{ source: "/.well-known/agent-card.json", destination: "/api/a2a" }]
  },
  async redirects() {
    return [{ source: "/bench", destination: "/publish", permanent: false }]
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
