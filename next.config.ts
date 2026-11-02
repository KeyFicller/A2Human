import type { NextConfig } from "next";

// The Python API listens on this internal port. The public port stays 3847.
const apiOrigin = process.env.A2HUMAN_API_ORIGIN || "http://127.0.0.1:3848"

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "**.app.github.dev", "**.trycloudflare.com"],
  async rewrites() {
    return [
      { source: "/.well-known/agent-card.json", destination: `${apiOrigin}/api/a2a` },
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    ]
  },
  async redirects() {
    return [
      { source: "/bench", destination: "/publish", permanent: false },
      { source: "/post", destination: "/me", permanent: false },
      { source: "/board", destination: "/me", permanent: false },
      { source: "/board/:id", destination: "/tasks/:id", permanent: false },
    ]
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
