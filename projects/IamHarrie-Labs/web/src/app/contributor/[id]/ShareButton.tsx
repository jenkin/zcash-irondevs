"use client";

import { useRef, useState } from "react";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function share() {
    copyToClipboard(window.location.href);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1800);
  }

  // The button itself is the confirmation -- it swaps to a checkmark and
  // "Copied" for a moment, then reverts on its own, rather than popping a
  // separate element next to it that the eye has to jump to.
  return (
    <button type="button" className="btn btn-primary" onClick={share} style={{ minWidth: 148 }}>
      {copied ? "✓ Copied" : "Share this page"}
    </button>
  );
}

/** execCommand runs synchronously, unlike navigator.clipboard.writeText's
 * promise -- that matters here because the whole point is that the button's
 * "Copied" state appears the instant it's clicked, not after an awaited
 * result that (per earlier testing on this exact button) can't be relied on
 * to ever resolve in every browsing context. clipboard.writeText is kept
 * only as a fallback for the rare case execCommand itself is unavailable. */
function copyToClipboard(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    navigator.clipboard?.writeText(text).catch(() => {});
  }
  document.body.removeChild(ta);
}
