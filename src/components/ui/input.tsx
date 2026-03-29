import * as React from "react";
import { cn } from "~/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-12 min-w-0 w-full rounded-none border border-(--border) bg-(--panel-soft) px-4 py-3 text-sm text-(--text) shadow-none transition-[border-color,background,box-shadow] placeholder:text-(--muted) focus-visible:border-(--brand) focus-visible:bg-(--bg-elevated) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg) disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
