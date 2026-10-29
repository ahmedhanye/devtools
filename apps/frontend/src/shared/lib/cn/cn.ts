import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges conditional class names with `clsx` and resolves conflicting Tailwind CSS utilities via `twMerge`.
 *
 * @param inputs - Class strings, objects, arrays, or falsy conditional values.
 * @returns Deduplicated and merged class name string.
 *
 * @example
 * ```ts
 * cn("px-4 py-2", isCompact && "px-2", className);
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
