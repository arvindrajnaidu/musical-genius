"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typing for the parts of the IFrame Player API we use.
type YTPlayer = {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  setVolume(v: number): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// iPhone and iPad browsers ignore setVolume (and the player reports the new
// value late everywhere, so it can't be probed reliably). iPadOS claims to be a
// Mac, but a touch screen gives it away.
function fixedVolume(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

const PLAYING = 1;
const ENDED = 0;
// iPad browsers only start a video with sound from a tap. The host's tap on
// "start" is spent before the player exists, so a song that hasn't started by
// now gets a big play button; one tap unlocks autoplay for the rest of the game.
const TAP_AFTER_MS = 4000;
const STEP_MS = 100;

// The TV's player. One iframe for the whole game; changing `videoId` loads the
// next song in place (so the browser's autoplay permission from the host's first
// click carries over). Reports when a song actually starts, ends, or can't play
// (errors 101/150: the uploader blocked embedding).
//
// DJ-style volume: `volume` is a target the player ramps to over `fadeMs`, and
// every song fades in from silence over `fadeInMs` once it actually plays.
// iPhone/iPad Safari ignores setVolume (volume is hardware-only there);
// `onVolumeSupport(false)` tells the host so it can lean on visuals instead.
export function YouTubePlayer({
  videoId,
  paused,
  volume = 100,
  fadeMs = 2500,
  fadeInMs = 2000,
  onStarted,
  onEnded,
  onError,
  onVolumeSupport,
  className = "aspect-video w-full rounded-3xl",
}: {
  className?: string;
  videoId: string;
  paused?: boolean;
  volume?: number;
  fadeMs?: number;
  fadeInMs?: number;
  onStarted?: () => void;
  onEnded?: () => void;
  onError?: (code: number) => void;
  onVolumeSupport?: (supported: boolean) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const handlers = useRef({ onStarted, onEnded, onError, onVolumeSupport });
  const applied = useRef(100);
  const target = useRef(volume);
  const fade = useRef({ fadeMs, fadeInMs });
  const ramp = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedFor = useRef<string | null>(null);
  const erroredFor = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  const [stuckFor, setStuckFor] = useState<string | null>(null);

  useEffect(() => {
    handlers.current = { onStarted, onEnded, onError, onVolumeSupport };
    pausedRef.current = paused;
    target.current = volume;
    fade.current = { fadeMs, fadeInMs };
  });

  // Glide from the current volume to `to` in small steps.
  function rampTo(to: number, ms: number) {
    if (ramp.current) clearInterval(ramp.current);
    ramp.current = null;
    const from = applied.current;
    const steps = Math.max(1, Math.round(ms / STEP_MS));
    let i = 0;
    const step = () => {
      i++;
      applied.current = from + ((to - from) * Math.min(i, steps)) / steps;
      player.current?.setVolume(Math.round(applied.current));
      if (i >= steps && ramp.current) {
        clearInterval(ramp.current);
        ramp.current = null;
      }
    };
    if (steps === 1) step();
    else ramp.current = setInterval(step, STEP_MS);
  }

  function silence() {
    if (ramp.current) clearInterval(ramp.current);
    ramp.current = null;
    applied.current = 0;
    player.current?.setVolume(0);
  }

  useEffect(() => {
    if (player.current) rampTo(volume, fadeMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new target starts a fade
  }, [volume]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      if (startedFor.current !== videoId && erroredFor.current !== videoId && !pausedRef.current) setStuckFor(videoId);
    }, TAP_AFTER_MS);
    return () => clearTimeout(t);
  }, [videoId, paused]);

  useEffect(() => {
    let cancelled = false;
    if (player.current) {
      if (loaded.current !== videoId) {
        loaded.current = videoId;
        silence();
        // While paused (the TV's "Up next" card), only cue it; play starts it.
        if (pausedRef.current) player.current.cueVideoById(videoId);
        else player.current.loadVideoById(videoId);
      }
      return;
    }
    loadApi().then((YT) => {
      if (cancelled || !el.current || player.current) return;
      loaded.current = videoId;
      player.current = new YT.Player(el.current, {
        videoId,
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3 },
        events: {
          onReady: () => {
            const p = player.current;
            if (!p) return;
            handlers.current.onVolumeSupport?.(!fixedVolume());
            silence();
            if (!pausedRef.current) p.playVideo();
          },
          onStateChange: (e) => {
            if (e.data === PLAYING) setStuckFor(null);
            if (e.data === PLAYING && startedFor.current !== loaded.current) {
              startedFor.current = loaded.current;
              silence();
              rampTo(target.current, fade.current.fadeInMs);
              handlers.current.onStarted?.();
            }
            if (e.data === ENDED) handlers.current.onEnded?.();
          },
          onError: (e) => {
            erroredFor.current = loaded.current;
            setStuckFor(null);
            handlers.current.onError?.(e.data);
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!player.current) return;
    if (paused) player.current.pauseVideo();
    else player.current.playVideo();
  }, [paused]);

  useEffect(
    () => () => {
      if (ramp.current) clearInterval(ramp.current);
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  return (
    // The API swaps the inner div for a fixed-size iframe; stretch it to fill.
    <div className={`overflow-hidden bg-black [&_iframe]:h-full [&_iframe]:w-full ${className}`}>
      <div className="relative h-full w-full">
        <div ref={el} />
        {stuckFor === videoId && (
          // Above the host screen's click shield, below its top bar.
          <button
            onClick={() => {
              player.current?.playVideo();
              setStuckFor(null);
            }}
            className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/60"
          >
            <span className="rounded-full bg-white px-10 py-6 text-4xl font-bold text-stage shadow-2xl">▶ Tap to play</span>
          </button>
        )}
      </div>
    </div>
  );
}
