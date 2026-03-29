import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex select-none items-center rounded-none px-2 py-[3px] text-xs font-semibold [font-family:var(--font-accent)] uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-(--brand) text-white",
        secondary:
          "border border-(--border) bg-(--panel-soft) text-(--brand-deep)",
        outline:
          "border border-(--border-strong) bg-transparent text-(--muted)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
