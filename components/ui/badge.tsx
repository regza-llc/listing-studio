import * as React from "react";

import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border bg-background text-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border border-amber-200",
  info: "bg-sky-100 text-sky-700 border border-sky-200",
  neutral: "bg-zinc-100 text-zinc-700 border border-zinc-200",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none transition-colors whitespace-nowrap",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
