import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker (Dockerfile, BUILD_STANDALONE=1): .next/standalone — сервер с минимумом node_modules. Локально и в CI — `next start`.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  serverExternalPackages: ["web-push"],
  // Картинка для сторис рисуется на лету и читает шрифты и спрайты боссов с диска — в standalone их нужно положить явно
  outputFileTracingIncludes: {
    "/workouts/\\[id\\]/story": ["./assets/fonts/**/*", "./assets/icons/game/bosses/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Встраивать сайт может только веб-версия Telegram (Mini App во фрейме); остальным — запрет, как DENY
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://web.telegram.org" },
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
