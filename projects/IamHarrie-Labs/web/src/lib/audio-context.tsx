"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

interface AudioCtx {
  playing: boolean;
  toggle: () => void;
  play: () => void;
}

const Ctx = createContext<AudioCtx | null>(null);

/** Mounted once in the root layout, so the <audio> element itself survives
 * navigation between pages (the explorer, a contributor profile, the
 * directory) -- those are separate routes, not nested views, so anything
 * owned by a single page would be torn down and the music would stop the
 * moment someone clicked through to a profile. Living here instead means
 * "keep playing until I say stop" is actually true across the whole site. */
export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function play() {
    setPlaying(true);
    audioRef.current?.play().catch(() => {});
  }

  function toggle() {
    setPlaying((p) => {
      const next = !p;
      if (next) audioRef.current?.play().catch(() => {});
      else audioRef.current?.pause();
      return next;
    });
  }

  return (
    <Ctx.Provider value={{ playing, toggle, play }}>
      {children}
      <audio ref={audioRef} src="/audio/theme.mp3" loop preload="none" />
    </Ctx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
