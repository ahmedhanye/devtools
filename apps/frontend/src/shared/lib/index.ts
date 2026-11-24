/**
 * Shared frontend utilities and hydration-safe React hooks.
 *
 * @packageDocumentation
 */
export { cn } from "./cn";
// fallow-ignore-next-line unused-export -- retained public utility hook in shared/lib for upcoming UI slices
export { useIsMounted } from "./use-is-mounted";
export { useIsMobile } from "./use-mobile";
export {
  updateNativeSearchParams,
  useNativeSearchParams,
} from "./use-native-search-params";
