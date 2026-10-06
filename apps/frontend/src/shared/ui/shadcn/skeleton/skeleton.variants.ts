import { cva } from "class-variance-authority";

export const skeletonVariants = cva("bg-muted animate-pulse", {
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
