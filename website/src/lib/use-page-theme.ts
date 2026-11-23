import { useEffect, useState } from "react";
import type { ThemeName } from "choropleth-kit";

/** Follows the docs page's light/dark mode (Starlight sets `data-theme` on <html>). Docs-only helper. */
export function usePageTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>("light");
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
