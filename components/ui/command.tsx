"use client";

import * as React from "react";
import {
  Command as CommandPrimitive,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from "cmdk";
import { cn } from "@/lib/utils";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  // bg must be overridden at each call-site: use bg-(--bg-elevated) for popovers, bg-(--bg-field) for inline search
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex w-full min-h-0 flex-col overflow-hidden rounded-md bg-(--bg-field) text-(--text-primary)",
      className,
    )}
    {...props}
  />
));
Command.displayName = "Command";

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "max-h-[min(320px,50vh)] overflow-x-hidden overflow-y-auto overscroll-contain",
      className,
    )}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
};
