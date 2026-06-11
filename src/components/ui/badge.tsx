import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive/15 text-destructive",
  success: "border-transparent bg-green-500/15 text-green-500 dark:text-green-400",
  warning: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  outline: "text-foreground",
};

type Variant = keyof typeof variants;

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
export type { Variant as BadgeVariant };
