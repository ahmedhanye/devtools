import { cva } from "class-variance-authority";

export const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-start text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pe-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground *:data-[slot=alert-description]:text-destructive-subtle-foreground/90 *:[svg]:text-current",
        warning:
          "border-warning-border bg-warning-subtle text-warning-subtle-foreground *:data-[slot=alert-description]:text-warning-subtle-foreground/90 *:[svg]:text-current",
        info: "border-info-border bg-info-subtle text-info-subtle-foreground *:data-[slot=alert-description]:text-info-subtle-foreground/90 *:[svg]:text-current",
        success:
          "border-success-border bg-success-subtle text-success-subtle-foreground *:data-[slot=alert-description]:text-success-subtle-foreground/90 *:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
