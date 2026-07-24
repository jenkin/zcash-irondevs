"use client";

import { useAudio } from "@/lib/audio-context";

export default function MusicButton() {
  const { playing, toggle } = useAudio();
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      aria-label={playing ? "Pause the music" : "Play the music"}
      onClick={toggle}
      style={{ width: 34, height: 34, fontSize: 12, flex: "none" }}
    >
      {playing ? "II" : "♪"}
    </button>
  );
}
