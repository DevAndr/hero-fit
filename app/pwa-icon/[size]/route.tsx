import { ImageResponse } from "next/og";

const SIZES = new Set([96, 180, 192, 512]);

/** PNG-иконки приложения (манифест, push, iOS) — рисуются из того же знака, что и логотип. */
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const glyph = Math.round(size * 0.56);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#00d492",
        }}
      >
        {/* lucide «dumbbell» */}
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
          <path d="m2.5 21.5 1.4-1.4" />
          <path d="m20.1 3.9 1.4-1.4" />
          <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
          <path d="m9.6 14.4 4.8-4.8" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
