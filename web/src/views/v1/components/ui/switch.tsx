// Hand-rolled Switch. `<button role="switch" aria-checked>` gives the
// screen-reader contract for free; CSS does the iOS-toggle visual.
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ id, checked, onCheckedChange, disabled, className, ...aria }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
        "border-border focus-visible:outline-2 focus-visible:outline-offset-2",
        checked ? "bg-sky-400/80" : "bg-muted",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-zinc-50 shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  ),
);
Switch.displayName = "Switch";
