"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { useViz, type Theme } from "@/lib/store";

// apply + persist the theme; runs on mount to pick up a saved preference
function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("ironwood-theme", theme);
  } catch {
    /* private mode, ignore */
  }
}

export default function ThemeToggle() {
  const theme = useViz((s) => s.theme);
  const set = useViz((s) => s.set);

  useEffect(() => {
    let saved: Theme | null = null;
    try {
      saved = localStorage.getItem("ironwood-theme") as Theme | null;
    } catch {
      /* ignore */
    }
    if (saved === "light" || saved === "dark") set("theme", saved);
  }, [set]);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      onClick={() => set("theme", next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="glass pointer-events-auto grid size-11 place-items-center rounded-xl text-gold"
    >
      <motion.span
        key={theme}
        initial={{ rotate: -35, opacity: 0, scale: 0.7 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      </motion.span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
