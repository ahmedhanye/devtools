import { cva } from "class-variance-authority";

export const tabsListVariants = cva(
  "group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center gap-1 rounded-lg p-[3px] group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "border-border bg-muted border",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
