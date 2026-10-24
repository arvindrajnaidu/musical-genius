import type { NextConfig } from "next";

// Two build targets from one codebase (same setup as Birthday Scroll):
//
//   web    (default) — deployed to Vercel. This is what the host opens on the TV
//                      and what guests can use from a phone browser.
//   native (NEXT_BUILD_TARGET=native) — a fully static export bundled inside the
//                      iOS/Android app (the guest "controller").
//
// The app is entirely client-side (Firebase web SDK), so both builds are the
// same pages. Rooms are addressed with a query string (/play?code=ABCD) rather
// than a dynamic segment so the static export needs no generateStaticParams.
const native = process.env.NEXT_BUILD_TARGET === "native";

const nextConfig: NextConfig = native
  ? {
      output: "export",
      // Emits out/play/index.html rather than out/play.html, which is what
      // Capacitor's local asset server resolves cleanly.
      trailingSlash: true,
      images: { unoptimized: true },
      // "out" is gitignored and matches `webDir` in capacitor.config.ts.
      distDir: "out",
    }
  : {};

export default nextConfig;
