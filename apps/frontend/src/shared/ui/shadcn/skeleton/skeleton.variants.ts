import { cva } from "class-variance-authority";

export const skeletonVariants = cva("animate-pulse bg-muted", {
  variants: {
    variant: {
      default: "rounded-md",
      card: "rounded-xl",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
