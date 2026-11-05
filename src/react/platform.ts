import { useSyncExternalStore } from "react";

/** macOS, iOS e iPadOS: ahí el modificador del zoom es ⌘, no Ctrl. */
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
 * `true` en plataformas Apple. Con `useSyncExternalStore` el render del servidor y el de la
 * hidratación coinciden (`false`) y el cliente se corrige después, sin avisos de hidratación.
 */
export const useIsApplePlatform = (): boolean =>
  useSyncExternalStore(subscribeNothing, isApplePlatform, () => false);
