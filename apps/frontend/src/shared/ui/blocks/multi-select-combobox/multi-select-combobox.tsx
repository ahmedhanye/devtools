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

function handleActionButtonKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
) {
  if (event.key === "Enter") {
    event.stopPropagation();
  }
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
      aria-checked={selected}
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
              onKeyDown={handleActionButtonKeyDown}
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

function FooterActionButton({
  label,
  onClick,
  className,
}: {
  label?: string;
  onClick: () => void;
  className: string;
}) {
  if (!label) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={handleActionButtonKeyDown}
      className={className}
    >
      {label}
    </button>
  );
}

function ComboboxFooter({
  footerText,
  clearLabel,
  selectAllLabel,
  onSelectAll,
  onClearAll,
}: {
  footerText?: string;
  clearLabel?: string;
  selectAllLabel?: string;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  if (!selectAllLabel && !clearLabel && !footerText) {
    return null;
  }
  return (
    <div className="border-border flex items-center justify-between gap-2 border-t px-2.5 py-2 text-xs">
      <span className="text-muted-foreground truncate">{footerText ?? ""}</span>
      <div className="flex shrink-0 items-center gap-2">
        <FooterActionButton
          label={clearLabel}
          onClick={onClearAll}
          className="text-muted-foreground hover:text-foreground shrink-0 font-medium"
        />
        <FooterActionButton
          label={selectAllLabel}
          onClick={onSelectAll}
          className="text-primary hover:text-primary/80 shrink-0 font-medium"
        />
      </div>
    </div>
  );
}

function useComboboxHandlers({
  options,
  selectedValues,
  selectedSet,
  onSelectedValuesChange,
}: {
  options: readonly MultiSelectOption[];
  selectedValues: readonly string[];
  selectedSet: ReadonlySet<string>;
  onSelectedValuesChange: (nextValues: string[]) => void;
}) {
  const handleToggle = useCallback(
    (value: string) => {
      const next = selectedSet.has(value)
        ? selectedValues.filter((existing) => existing !== value)
        : [...selectedValues, value];
      onSelectedValuesChange(next);
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

  const handleClearAll = useCallback(() => {
    onSelectedValuesChange([]);
  }, [onSelectedValuesChange]);

  return { handleToggle, handleSelectOnly, handleSelectAll, handleClearAll };
}

function ComboboxPopoverBody({
  options,
  selectedSet,
  searchPlaceholder,
  emptyText,
  onlyActionLabel,
  footerText,
  clearLabel,
  selectAllLabel,
  onToggle,
  onSelectOnly,
  onSelectAll,
  onClearAll,
}: {
  options: readonly MultiSelectOption[];
  selectedSet: ReadonlySet<string>;
  searchPlaceholder: string;
  emptyText: string;
  onlyActionLabel?: string;
  footerText?: string;
  clearLabel?: string;
  selectAllLabel?: string;
  onToggle: (value: string) => void;
  onSelectOnly: (value: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
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
                  onToggle={onToggle}
                  onSelectOnly={onlyActionLabel ? onSelectOnly : undefined}
                />
              ))}
            </CommandGroup>
          </ScrollArea>
        </CommandList>
        <ComboboxFooter
          footerText={footerText}
          clearLabel={clearLabel}
          selectAllLabel={selectAllLabel}
          onSelectAll={onSelectAll}
          onClearAll={onClearAll}
        />
      </Command>
    </PopoverContent>
  );
}

interface MultiSelectComboboxProps {
  options: readonly MultiSelectOption[];
  selectedValues: readonly string[];
  onSelectedValuesChange: (nextValues: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  selectAllLabel?: string;
  clearAllLabel?: string;
  onlyActionLabel?: string;
  footerText?: string;
  ariaLabel?: string;
  className?: string;
}

function useComboboxState({
  options,
  selectedValues,
  placeholder = "Select items",
  selectAllLabel,
  clearAllLabel,
  onSelectedValuesChange,
}: Pick<
  MultiSelectComboboxProps,
  | "options"
  | "selectedValues"
  | "placeholder"
  | "selectAllLabel"
  | "clearAllLabel"
  | "onSelectedValuesChange"
>) {
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const handlers = useComboboxHandlers({
    options,
    selectedValues,
    selectedSet,
    onSelectedValuesChange,
  });
  const triggerSummary = useMemo(
    () => getTriggerSummary(options, selectedValues, placeholder),
    [options, placeholder, selectedValues],
  );
  const hasUnselected = options.some(
    (option) => !selectedSet.has(option.value),
  );
  const visibleSelectAllLabel = hasUnselected ? selectAllLabel : undefined;
  const visibleClearLabel =
    selectedValues.length > 0 ? clearAllLabel : undefined;

  return {
    selectedSet,
    triggerSummary,
    visibleSelectAllLabel,
    visibleClearLabel,
    ...handlers,
  };
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
  clearAllLabel,
  onlyActionLabel,
  footerText,
  ariaLabel,
  className,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);

  const state = useComboboxState({
    options,
    selectedValues,
    placeholder,
    selectAllLabel,
    clearAllLabel,
    onSelectedValuesChange,
  });

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
        <span className="truncate font-normal">{state.triggerSummary}</span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </PopoverTrigger>
      <ComboboxPopoverBody
        options={options}
        selectedSet={state.selectedSet}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        onlyActionLabel={onlyActionLabel}
        footerText={footerText}
        clearLabel={state.visibleClearLabel}
        selectAllLabel={state.visibleSelectAllLabel}
        onToggle={state.handleToggle}
        onSelectOnly={state.handleSelectOnly}
        onSelectAll={state.handleSelectAll}
        onClearAll={state.handleClearAll}
      />
    </Popover>
  );
}
