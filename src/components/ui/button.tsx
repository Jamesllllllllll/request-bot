import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border text-sm font-medium transition-[background,color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg) disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-(--brand) text-white shadow-(--glow) hover:bg-(--brand-strong)",
        outline:
          "border-(--border-strong) bg-(--panel) text-(--text) hover:border-(--brand) hover:bg-(--panel-soft)",
        secondary:
          "border-(--border) bg-(--panel-soft) text-(--text) hover:border-(--border-strong) hover:bg-(--bg-elevated)",
        ghost:
          "border-transparent bg-transparent text-(--muted) hover:bg-(--panel) hover:text-(--text)",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-3.5",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-11 w-11 rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
