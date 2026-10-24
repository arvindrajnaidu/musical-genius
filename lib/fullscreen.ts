// Browser full screen for the TV. Browsers only allow it from a click, so the
// host's own button presses (Start game, Start the music, the ⛶ button) call it.
// Older Safari and some TV browsers only have the webkit-prefixed API.
type Doc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type El = HTMLElement & { webkitRequestFullscreen?: () => void };

export const isFullscreen = () => Boolean(document.fullscreenElement || (document as Doc).webkitFullscreenElement);

export function enterFullscreen(): void {
  if (typeof document === "undefined" || isFullscreen()) return;
  const el = document.documentElement as El;
  try {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch {
    /* not allowed here; the game works windowed too */
  }
}

export function toggleFullscreen(): void {
  if (!isFullscreen()) return enterFullscreen();
  const d = document as Doc;
  if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
  else d.webkitExitFullscreen?.();
}
