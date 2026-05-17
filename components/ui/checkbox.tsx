"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    return (
      <label
        className={cn(
          "relative inline-flex size-5 cursor-pointer items-center justify-center rounded-md border border-border bg-background transition-colors has-checked:bg-primary has-checked:border-primary",
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => {
            onChange?.(e);
            onCheckedChange?.(e.currentTarget.checked);
          }}
          {...props}
        />
        <Check className="size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" />
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
