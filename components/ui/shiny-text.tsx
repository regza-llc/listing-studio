import type * as React from "react";
import { cn } from "@/lib/utils";

export function ShinyText({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("shiny-text", className)} {...props}>
      {children}
    </span>
  );
}
