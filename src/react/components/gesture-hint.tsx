import { useState } from "react";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";
import { useIsApplePlatform } from "../platform";

/**
 * El aviso «Usa Ctrl + rueda para hacer zoom» (⌘ en macOS) o «Usa dos dedos para mover el mapa»
 * (dd.md §11.1.2). Solo aparece con `wheel: "cooperative"`, cuando un gesto NO hace zoom pero se le
 * puede enseñar cómo: con `"always"` no hay nada que enseñar. Dura 1,5 s.
 *
 * Es `aria-hidden`: una ayuda visual, no un mensaje para lectores de pantalla (el zoom por teclado
 * y los botones ya son accesibles). Siempre está en el DOM y se muestra con un atributo + CSS: así
 * aparece y se va con un fundido, y el texto no desaparece antes de que termine de apagarse.
 */
export const GestureHint = ({ className }: { className?: string }) => {
  const { choropleth, store } = useChoroplethContext();
  const hint = useMapStore(store, (s) => s.gestureHint);
  const apple = useIsApplePlatform();

  // Durante el fundido de salida `hint` ya es `null`: se conserva el último para no cambiar el texto.
  // «Ajustar estado al cambiar un valor»: `hint` es un primitivo del store, así que es estable.
  const [last, setLast] = useState<"wheel" | "touch">("wheel");
  if (hint !== null && hint !== last) setLast(hint);

  const { labels } = choropleth;
  const text =
    last === "touch"
      ? labels.gestureHintTouch
      : apple
        ? labels.gestureHintWheelMac
        : labels.gestureHintWheel;

  return (
    <div
      className={className === undefined ? "cm-gesture-hint" : `cm-gesture-hint ${className}`}
      aria-hidden="true"
      data-visible={hint === null ? undefined : ""}
    >
      {text}
    </div>
  );
};
