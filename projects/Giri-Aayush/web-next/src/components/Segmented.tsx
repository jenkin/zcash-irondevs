"use client";

import { useId } from "react";
import { motion } from "motion/react";

export function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const uid = useId();
  return (
    <div
      className="relative flex gap-1 rounded-lg p-0.5"
      style={{ background: "var(--secondary)", border: "1px solid var(--hairline)" }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`label relative flex-1 rounded-md px-2.5 py-1.5 transition-colors ${
              on ? "text-gold" : "hover:text-foreground"
            }`}
            style={{ letterSpacing: "0.13em", ...(on ? {} : { color: "var(--muted-foreground)" }) }}
          >
            {/* the active pill slides between options with a spring */}
            {on && (
              <motion.span
                layoutId={`seg-${uid}-active`}
                className="absolute inset-0 -z-0 rounded-md"
                style={{ background: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--ring)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
