import { Borders } from "./components/borders";
import { Breadcrumb } from "./components/breadcrumb";
import { Bubbles } from "./components/bubbles";
import { DrillLayers } from "./components/drill-layers";
import { FallbackPoints } from "./components/fallback-points";
import { GestureHint } from "./components/gesture-hint";
import { Legend } from "./components/legend";
import { Regions } from "./components/regions";
import { Root } from "./components/root";
import { Selection } from "./components/selection";
import { Svg } from "./components/svg";
import { Tooltip } from "./components/tooltip";
import { Viewport } from "./components/viewport";
import { ZoomControls } from "./components/zoom-controls";

/** Nivel 2 (compound): `<Choropleth.Root>` + las piezas que quieras, en el orden que quieras. */
export const Choropleth = {
  Root,
  Svg,
  Regions,
  Borders,
  Breadcrumb,
  Bubbles,
  DrillLayers,
  FallbackPoints,
  Selection,
  Viewport,
  ZoomControls,
  GestureHint,
  Legend,
  Tooltip,
};
