"use client";

import { useEffect, useRef } from "react";

// Minimal typing for the parts of the IFrame Player API we use.
type YTPlayer = {
  loadVideoById(id: string): void;
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

// The TV's player. One iframe for the whole game; changing `videoId` loads the
// next song in place (so the browser's autoplay permission from the host's first
// click carries over). Reports when a song actually starts, ends, or can't play
// (errors 101/150: the uploader blocked embedding).
export function YouTubePlayer({
  videoId,
  paused,
  onStarted,
  onEnded,
  onError,
}: {
  videoId: string;
  paused?: boolean;
  onStarted?: () => void;
  onEnded?: () => void;
  onError?: (code: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const handlers = useRef({ onStarted, onEnded, onError });
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    handlers.current = { onStarted, onEnded, onError };
  });

  useEffect(() => {
    let cancelled = false;
    if (player.current) {
      if (loaded.current !== videoId) {
        loaded.current = videoId;
        player.current.loadVideoById(videoId);
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
          onReady: () => player.current?.playVideo(),
          onStateChange: (e) => {
            if (e.data === PLAYING && startedFor.current !== loaded.current) {
              startedFor.current = loaded.current;
              handlers.current.onStarted?.();
            }
            if (e.data === ENDED) handlers.current.onEnded?.();
          },
          onError: (e) => handlers.current.onError?.(e.data),
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
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  return (
    // The API swaps the inner div for a fixed-size iframe; stretch it to fill.
    <div className="aspect-video w-full overflow-hidden rounded-3xl bg-black [&_iframe]:h-full [&_iframe]:w-full">
      <div ref={el} />
    </div>
  );
}
