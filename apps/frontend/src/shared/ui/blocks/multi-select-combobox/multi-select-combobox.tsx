"use client";

import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/shadcn/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import { ScrollArea } from "@/shared/ui/shadcn/scroll-area";

/**
 * Single selectable entry inside {@link MultiSelectCombobox}.
 */
export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
  count?: number;
}

function ComboboxOptionRow({
  option,
  selected,
  onlyActionLabel,
  onToggle,
  onSelectOnly,
}: {
  option: MultiSelectOption;
  selected: boolean;
  onlyActionLabel?: string;
  onToggle: (value: string) => void;
  onSelectOnly?: (value: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onToggle(option.value);
  }, [onToggle, option.value]);

  const handleOnlyClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onSelectOnly?.(option.value);
    },
    [onSelectOnly, option.value],
  );

  return (
    <CommandItem
      value={`${option.label} ${option.value}`}
      onSelect={handleSelect}
      showCheck={false}
    >
      <div className="group/row flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Checkbox
            checked={selected}
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{option.label}</div>
            {option.description ? (
              <div className="text-muted-foreground truncate text-xs">
                {option.description}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {option.count !== undefined ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {option.count}
            </span>
          ) : null}
          {onlyActionLabel && onSelectOnly ? (
            <button
              type="button"
              onClick={handleOnlyClick}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-0.5 text-xs font-medium opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
            >
              {onlyActionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </CommandItem>
  );
}

function getTriggerSummary(
  options: readonly MultiSelectOption[],
  selectedValues: readonly string[],
  placeholder: string,
): string {
  if (selectedValues.length === 0) {
    return placeholder;
  }
  if (selectedValues.length === 1) {
    const matched = options.find((opt) => opt.value === selectedValues[0]);
    return matched ? matched.label : (selectedValues[0] ?? placeholder);
  }
  return `${selectedValues.length} selected`;
}

function ComboboxFooter({
  footerText,
  selectAllLabel,
  showSelectAll,
  onSelectAll,
}: {
  footerText?: string;
  selectAllLabel?: string;
  showSelectAll: boolean;
  onSelectAll: () => void;
}) {
  if (!showSelectAll && !footerText) {
    return null;
  }
  return (
    <div className="border-border flex items-center justify-between gap-2 border-t px-2.5 py-2 text-xs">
      <span className="text-muted-foreground truncate">{footerText ?? ""}</span>
      {showSelectAll && selectAllLabel ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-primary hover:text-primary/80 shrink-0 font-medium"
        >
          {selectAllLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Searchable multi-select popover combobox built on Base UI Popover and cmdk.
 */
export function MultiSelectCombobox({
  options,
  selectedValues,
  onSelectedValuesChange,
  placeholder = "Select items",
  searchPlaceholder = "Filter items...",
  emptyText = "No matching items.",
  selectAllLabel,
  onlyActionLabel,
  footerText,
  ariaLabel,
  className,
}: {
  options: readonly MultiSelectOption[];
  selectedValues: readonly string[];
  onSelectedValuesChange: (nextValues: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  selectAllLabel?: string;
  onlyActionLabel?: string;
  footerText?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const handleToggle = useCallback(
    (value: string) => {
      if (selectedSet.has(value)) {
        onSelectedValuesChange(
          selectedValues.filter((existing) => existing !== value),
        );
        return;
      }
      onSelectedValuesChange([...selectedValues, value]);
    },
    [onSelectedValuesChange, selectedSet, selectedValues],
  );

  const handleSelectOnly = useCallback(
    (value: string) => {
      onSelectedValuesChange([value]);
    },
    [onSelectedValuesChange],
  );

  const handleSelectAll = useCallback(() => {
    onSelectedValuesChange(options.map((option) => option.value));
  }, [onSelectedValuesChange, options]);

  const triggerSummary = useMemo(
    () => getTriggerSummary(options, selectedValues, placeholder),
    [options, placeholder, selectedValues],
  );

  const showSelectAll = Boolean(
    selectAllLabel &&
    options.length > 0 &&
    selectedValues.length < options.length,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel ?? placeholder}
            className={cn("w-full justify-between", className)}
          />
        }
      >
        <span className="truncate font-normal">{triggerSummary}</span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" padding="none" className="w-80">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <ScrollArea className="max-h-60">
              <CommandGroup>
                {options.map((option) => (
                  <ComboboxOptionRow
                    key={option.value}
                    option={option}
                    selected={selectedSet.has(option.value)}
                    onlyActionLabel={onlyActionLabel}
                    onToggle={handleToggle}
                    onSelectOnly={
                      onlyActionLabel ? handleSelectOnly : undefined
                    }
                  />
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
          <ComboboxFooter
            footerText={footerText}
            selectAllLabel={selectAllLabel}
            showSelectAll={showSelectAll}
            onSelectAll={handleSelectAll}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
