"use client";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "~/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-oklch(0.923 0.003 48.717) shadow-xs transition-shadow outline-none focus-visible:border-oklch(0.709 0.01 56.259) focus-visible:ring-[3px] focus-visible:ring-oklch(0.709 0.01 56.259)/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-oklch(0.577 0.245 27.325)/20 data-[state=checked]:border-oklch(0.216 0.006 56.043) data-[state=checked]:bg-oklch(0.216 0.006 56.043) data-[state=checked]:text-oklch(0.985 0.001 106.423) dark:bg-oklch(0.923 0.003 48.717)/30 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 dark:data-[state=checked]:bg-oklch(0.216 0.006 56.043) dark:border-oklch(1 0 0 / 10%) dark:border-oklch(1 0 0 / 15%) dark:focus-visible:border-oklch(0.553 0.013 58.071) dark:focus-visible:ring-oklch(0.553 0.013 58.071)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:data-[state=checked]:border-oklch(0.923 0.003 48.717) dark:data-[state=checked]:bg-oklch(0.923 0.003 48.717) dark:data-[state=checked]:text-oklch(0.216 0.006 56.043) dark:dark:bg-oklch(1 0 0 / 15%)/30 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40 dark:dark:data-[state=checked]:bg-oklch(0.923 0.003 48.717)",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
