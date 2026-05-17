"use client";

import type * as React from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * ホバー時にマウス位置に光が走るカード。
 * CSS変数 --mouse-x / --mouse-y を pointermove で更新する。
 */
export function SpotlightCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--mouse-x", `${x}px`);
    el.style.setProperty("--mouse-y", `${y}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn("spotlight-card", className)}
      {...props}
    >
      {children}
    </div>
  );
}
