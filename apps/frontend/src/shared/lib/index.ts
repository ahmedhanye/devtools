/**
 * Shared frontend utilities and hydration-safe React hooks.
 *
 * @packageDocumentation
 */
export { cn } from "./cn/cn";
// fallow-ignore-next-line unused-export -- retained public utility hook in shared/lib for upcoming UI slices
export { useIsMounted } from "./use-is-mounted/use-is-mounted";
export { useIsMobile } from "./use-mobile/use-mobile";
export {
  isPlainPrimaryClick,
  updateNativeSearchParams,
  useNativeSearchParams,
} from "./use-native-search-params/use-native-search-params";
