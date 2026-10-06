import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib";
import { skeletonVariants } from "./skeleton.variants";

function Skeleton({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Skeleton };
