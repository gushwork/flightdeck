"use client";

import * as React from "react";
import { defaultFilter } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  label: string;
  disabled?: boolean;
  keywords?: string[];
};

export type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
  /** When false, list is not filterable (still shows options in a popover). */
  showSearch?: boolean;
  contentClassName?: string;
  /** Keyboard shortcut target (e.g. runs page `f`) — query `[data-focus-first]`. */
  shortcutFocusFirst?: boolean;
  /** Refined popover chrome (search row, list, shadows). */
  variant?: "default" | "panel";
};

/** Combines label + value for cmdk scoring (regions, ids). */
function optionKeywords(opt: SearchableOption): string[] {
  const k = opt.keywords?.length ? [...opt.keywords] : [];
  if (!k.includes(opt.label)) k.push(opt.label);
  if (!k.includes(opt.value)) k.push(opt.value);
  return k;
}

export const SearchableSelect = React.forwardRef<
  HTMLButtonElement,
  SearchableSelectProps
>(function SearchableSelect(
  {
    value,
    onValueChange,
    options,
    placeholder = "Select…",
    searchPlaceholder = "Search…",
    emptyText = "No results found.",
    disabled = false,
    required = false,
    id,
    name,
    "aria-label": ariaLabel,
    className,
    showSearch = true,
    contentClassName,
    shortcutFocusFirst = false,
    variant = "default",
  },
  ref,
) {
  const [open, setOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const reactId = React.useId();
  const listboxId = `${id ?? "searchable"}-listbox-${reactId.replace(/:/g, "")}`;

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? (value ? value : placeholder);

  const handleSelect = React.useCallback(
    (next: string) => {
      onValueChange(next);
      setOpen(false);
    },
    [onValueChange],
  );

  const filterFn = React.useCallback(
    (candidate: string, search: string, keywords?: string[]) =>
      defaultFilter(candidate, search, keywords),
    [],
  );

  const shortcutAttr =
    shortcutFocusFirst ? ({ "data-focus-first": "" } as Record<string, string>) : {};

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) searchInputRef.current = null;
      }}
    >
      {name ? (
        <input type="hidden" name={name} value={value} readOnly aria-hidden />
      ) : null}
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-required={required}
          disabled={disabled}
          data-searchable-select-trigger=""
          {...shortcutAttr}
          className={cn(
            "inline-flex w-auto min-w-0 max-w-full items-center justify-between gap-2 rounded-md border border-(--border) bg-(--bg-field) px-2.5 py-1.5 text-left text-xs text-(--text-primary) outline-none transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && value === "" && "text-(--text-muted)",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="shrink-0 text-(--text-faint)"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0 overflow-hidden",
          variant === "panel" &&
            "rounded-xl border-(--border) bg-(--bg-elevated) shadow-xl ring-1 ring-(--border-subtle)",
          contentClassName,
        )}
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => {
          if (showSearch) {
            e.preventDefault();
            requestAnimationFrame(() => searchInputRef.current?.focus());
          }
        }}
      >
        <Command
          label={ariaLabel}
          shouldFilter={showSearch}
          filter={showSearch ? filterFn : () => 1}
          className={cn(
            "flex max-h-[min(320px,50vh)] flex-col overflow-hidden",
            variant === "panel" && "bg-(--bg-elevated)",
          )}
        >
          {showSearch ? (
            <div
              className={cn(
                "relative shrink-0 border-b border-(--border-subtle)",
                variant === "panel" && "bg-(--bg-muted)/40",
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-faint)"
                aria-hidden
              >
                <circle cx="6.5" cy="6.5" r="4" />
                <path d="M10 10l3.5 3.5" />
              </svg>
              <CommandInput
                ref={searchInputRef}
                placeholder={searchPlaceholder}
                className={cn(
                  "h-10 w-full border-0 bg-transparent pl-9 pr-3 text-sm text-(--text-primary) outline-none",
                  "placeholder:text-(--text-faint)",
                )}
              />
            </div>
          ) : null}
          <CommandList
            id={listboxId}
            className={cn(
              "min-h-0 flex-1 py-1",
              showSearch && "max-h-[min(280px,calc(50vh-2.5rem))]",
            )}
          >
            <CommandEmpty className="px-3 py-6 text-center text-sm text-(--text-muted)">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value === "" ? "__empty__" : opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  keywords={optionKeywords(opt)}
                  onSelect={() => {
                    if (!opt.disabled) handleSelect(opt.value);
                  }}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm text-(--text-primary) transition-colors",
                    "mx-0.5 rounded-lg",
                    "data-[selected=true]:bg-(--accent-muted) data-[selected=true]:text-(--text-primary)",
                    "aria-selected:bg-(--accent-muted)",
                    "hover:bg-(--bg-hover) data-[selected=true]:hover:bg-(--accent-muted)",
                    "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
                    variant === "panel" && "mx-1",
                  )}
                >
                  <span className="block truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

SearchableSelect.displayName = "SearchableSelect";
