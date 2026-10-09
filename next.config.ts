import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker (Dockerfile, BUILD_STANDALONE=1): .next/standalone — сервер с минимумом node_modules. Локально и в CI — `next start`.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  serverExternalPackages: ["web-push"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Service worker не кэшируем — обновления подхватываются сразу.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
