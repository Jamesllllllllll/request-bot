import { cn } from "~/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-oklch(0.97 0.001 106.424) dark:bg-oklch(0.268 0.007 34.298)",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
