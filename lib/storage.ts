// Small per-device conveniences (remembered nickname, current room). Storage can
// be blocked (private mode, locked-down webviews), so every access is guarded.
export function load(key: string, area: "local" | "session" = "local"): string | null {
  try {
    return (area === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string | null, area: "local" | "session" = "local") {
  try {
    const s = area === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* non-fatal */
  }
}
