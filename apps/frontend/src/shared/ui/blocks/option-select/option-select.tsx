"use client";

import { Label } from "@/shared/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/shadcn/select";

/**
 * Domain-agnostic labeled or standalone Base UI Select wrapper mapping labels cleanly.
 */
export function OptionSelect({
  id,
  label,
  ariaLabel,
  value,
  items,
  options,
  onValueChange,
  triggerClassName,
  className,
}: {
  id?: string;
  label?: string;
  ariaLabel?: string;
  value: string;
  items: Record<string, string>;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string | null) => void;
  triggerClassName?: string;
  className?: string;
}) {
  const selectNode = (
    <Select value={value} onValueChange={onValueChange} items={items}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={triggerClassName}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!label) {
    return selectNode;
  }

  return (
    <div className={className ?? "flex flex-col gap-2"}>
      <Label htmlFor={id}>{label}</Label>
      {selectNode}
    </div>
  );
}
