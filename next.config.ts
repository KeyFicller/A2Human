import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "**.app.github.dev", "**.trycloudflare.com"],
  async rewrites() {
    return [{ source: "/.well-known/agent-card.json", destination: "/api/a2a" }]
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
