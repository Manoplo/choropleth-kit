import { useSyncExternalStore } from "react";

/** macOS, iOS and iPadOS: there the zoom modifier is ⌘, not Ctrl. */
const isApplePlatform = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /Mac|iPhone|iPad|iPod/i.test(platform);
};

const subscribeNothing = () => () => {};

/**
 * `true` on Apple platforms. With `useSyncExternalStore` the server render and the hydration render
 * match (`false`) and the client corrects itself afterwards, with no hydration warnings.
 */
export const useIsApplePlatform = (): boolean =>
  useSyncExternalStore(subscribeNothing, isApplePlatform, () => false);
