"use client";

import { useEffect, useRef, useState } from "react";

export function NumberTicker({
  value,
  duration = 600,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const startedAt = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
