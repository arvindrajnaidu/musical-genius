// Where the web app is deployed. Native webviews run at capacitor://localhost
// (iOS) or https://localhost (Android), which is neither shareable nor serves the
// API routes, so the app build points at the deployed site instead.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://musical-genius.vercel.app";

export function siteOrigin(): string {
  if (!process.env.NEXT_PUBLIC_NATIVE && typeof location !== "undefined" && location.protocol.startsWith("http"))
    return location.origin;
  return SITE_URL;
}
