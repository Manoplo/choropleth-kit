# Choropleth Kit: proceso de construcción, paso a paso

> **Para qué sirve este documento.** Es el diario didáctico del proyecto. Cada paso explica **qué se
> hizo, por qué y cómo comprobar que funciona**. Está escrito para una persona que sabe crear
> aplicaciones React pero no librerías, y para cualquier agente que retome el trabajo sin contexto.
>
> **Documento de diseño de referencia:** `coropleth-library.md` (en esta misma carpeta). En este
> diario y en los comentarios del código se cita con su alias histórico **`dd.md`**; los números de
> sección (`dd.md §9.2`, `§11`…) son los de ese archivo. Aquí no se repite el diseño, solo se explica
> cómo se va construyendo.
>
> **Handoff vigente:** la sección **«Estado actual y handoff»** de justo debajo (léela primero) y
> `dd.md §21`. **No hace falta leer los dos documentos enteros** (casi 5.000 líneas): la sección de
> handoff dice qué leer para el siguiente paso.
>
> **Regla de trabajo:** un paso cada vez, acotado y verificable. No se empieza el siguiente hasta que
> quien aprende confirma que entiende el actual.

## Estado actual y handoff (leer primero)

> Actualizada tras el **paso 28** (puro `core`, sin efecto visual; **sin commitear**; el 27 está confirmado y también sin commitear). Rama `master`. **567 tests** en verde; `typecheck`, `lint`,
> `format:check`, `build` y `build-storybook` limpios. Cobertura de `src/core` 100 % líneas.

### Dónde estamos

| Fase                   | Pasos  | Estado                                                                                                        |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| v0.1                   | 1-13   | ✅                                                                                                            |
| A · cimientos          | 14-22  | ✅ (revisión visual de «Foundations» pendiente del humano)                                                    |
| **B · cámara**         | 23-26  | ✅ código y tests. Revisión visual: el 24 la dio por buena el humano; **25 y 26 sin confirmar**               |
| B · cámara             | **27** | ✅ (revisión visual confirmada por el humano)                                                                 |
| C · drill-down (v0.4)  | 28-33  | **28** ✅ `core/drill.ts` (reducer). **29 ⏳ SIGUIENTE**: `rebaseProjection` + `relativeTransform` (tarea 16) |
| D · pulido visual      | 34-37  | ⏳                                                                                                            |
| Accesibilidad completa | —      | ⏳ **al final, por decisión del humano** (`dd.md §13`)                                                        |

### Qué leer para el paso 27 (no más)

1. `AGENTS.md` (reglas; **la primera: commit y push solo bajo petición explícita**).
2. Este «Estado actual» y el **paso 26** del diario (estilo de la entrada y último código).
3. `dd.md §11.1.3` (punto 2, resize sin salto), `§11.1.4` (inercia) y `§11.1.6` (contraescalado), líneas
   ~1142-1345 de `coropleth-library.md`. `§21` tarea 14 resume el alcance.
4. El código que se toca: `src/react/use-zoom.ts`, `src/core/camera.ts` (`inertiaOffset`, `preserveView`
   ya existen y están probadas), `src/react/styles.css` (burbujas).

**Alcance del 27** (ya hecho en `core`, falta conectarlo): `bubbleScaling: "sqrt" | "screen" | "geo"` con UNA
variable CSS (`--cm-bubble-scale`: `1/√k`, `1/k` o `1`; el CSS aplica `transform: scale(...)` con
`transform-box: fill-box`); inercia al soltar un arrastre (falta la **velocidad de suelta**: muestras de los
últimos ≤ 100 ms, umbral 0,3 px/ms, `inertiaOffset`, se cancela con `pointerdown`); y **resize sin salto**
(`preserveView` al cambiar el tamaño). Hoy: las burbujas **crecen** con el zoom y al redimensionar con zoom
aplicado la vista se desplaza.

### Decisiones del humano que se desvían de `dd.md` (vigentes)

- **Rueda:** `wheel` por defecto `"always"` (con el ratón encima, la rueda hace zoom); `"cooperative"` es opt-in.
- **Controles de zoom:** opt-in (`zoom={{ controls: true }}`). El aviso de gesto solo sale en `cooperative`.
- **España** se encuadra **con Canarias** (`DEFAULT_FOCUS_BOUNDS`); `focusBounds={{ ES: null }}` la quita.
- **Accesibilidad al final**, no repartida (flechas, `role="img"` del `<svg>`, tabla alternativa, `aria-live`…).
- **Errores y avisos de consola en inglés**, con prefijo `[choropleth]`. Documentación y comentarios, en español.
- **`dimOthers` por defecto `"selection"`**. Chipre del Norte y Somalilandia quedan en gris sin id (Legal).
- Se puede **romper la API** antes de 1.0, sin alias de compatibilidad.

### Trampas aprendidas (cuestan tiempo si se repiten)

- **Los `@types` de d3 no son garantía de runtime.** `interpolateZoom.rho` está en la **función**, no en el
  interpolador (los tipos dicen lo contrario). Ante la duda, probar con una línea de `node -e`.
- **Winding order:** d3 espera el anillo exterior en sentido **horario**. El fixture `tests/fixtures.ts`
  (`twoSquares`) lo tiene al revés: su mapa es el mundo entero. Para tests de encuadre, usar polígonos propios.
- **Antimeridiano:** un polígono que cruza ±180° (Rusia, Fiyi) hace que `path.bounds` mida las dos mitades.
  Usar `getFocusExtent` / `projectBounds` (encuadran la mitad mayor).
- **`prettier --write` reformatea `src/geo/world-110m.json`** (está en `.prettierignore`; se genera compacto con
  `scripts/build-geo/build-world-110m.mjs`).
- **jsdom:** no tiene `Element.animate` (el fundido de reduced-motion salta directo); `MouseEvent.view` no se
  puede pasar en el constructor (usar `Object.defineProperty`); con temporizadores falsos, el supresor de clic de
  `d3-zoom` (`setTimeout 0`) no corre y se queda en `window`: vaciar los pendientes en `afterEach`.
- **Linter de React:** no leer ni escribir `ref.current` durante el render (también a través de una función que
  se pasa a algo que corre en el render). Si hace falta, registrar en el store desde un efecto.
- **`pnpm test <ruta1> <ruta2>`** puede dar recuentos engañosos; para un solo archivo usar
  `pnpm vitest run <archivo>`.
- **Hover/zoom no deben re-renderizar `Root`.** Se comprueba contando llamadas a `getId` (el join la llama una vez por
  fila en cada render). Cualquier cambio en `Root`, el hook o el store debe mantener esos tests en verde.

### Cómo trabajamos (el patrón que funciona)

1. Leer lo que gobierna el paso → diseñar → `core` puro con tests **antes** que React → componentes → story.
2. **Comprobar que los tests sirven con mutaciones a mano** (romper una línea clave, ver que algún test falla,
   revertir). Ya ha cazado errores propios.
3. Documentar el paso en el diario con la estructura de siempre: qué, por qué, orden interno, decisiones y
   desviaciones respecto a `dd.md`, tests, verificación visual **pendiente del humano**, preguntas de comprobación.
4. **No hay navegador en la sesión del agente**: lo visual (Storybook) lo revisa el humano. Un paso con efecto visible
   se marca `✅ Hecho*` hasta que lo confirma.
5. Ante una duda de diseño que `dd.md §21` marca como «preguntar al humano», **preguntar**, no suponer.
6. Ver `git status` antes de empezar y **no commitear sin que lo pida**.

### Preguntas abiertas

- **Ancla de las burbujas de Rusia** (§26.8): `getAnchorPoint` proyecta el anillo que cruza el antimeridiano vértice
  a vértice; visualmente salió plausible pero no está garantizado. ¿Prueba específica ahora o en el pulido?
- **Aviso de `scroll-jacking`** (§24.8): con `wheel: "always"` y el mapa en una página con scroll, el mapa se come la
  rueda. ¿El preset lo avisa en desarrollo o basta la documentación de la prop?
- Fronteras disputadas y política de Chipre del Norte / Somalilandia: decisión de Legal, no técnica (§F.2, §22).

### Prompt de arranque para una sesión nueva

> Lee `AGENTS.md` y la sección «Estado actual y handoff» de `choropleth-build-proccess.md`, y el paso 26 de ese
> diario. Sigue con el **paso 27** (contraescalado de burbujas, inercia y resize sin salto), leyendo solo
> `coropleth-library.md` §11.1.3 (punto 2), §11.1.4 y §11.1.6 y el código que se toca. Un paso cada vez; no
> commitees ni hagas push sin que te lo pida; la revisión visual la hago yo.

## Índice de pasos

| Paso  | Título                                                           | Estado                                                 |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| **1** | **Scaffolding: proyecto, bundler, tests y Storybook**            | ✅ Hecho                                               |
| **2** | **Dependencias mínimas para dibujar el primer mapa**             | ✅ Hecho (paquetes instalados; el código es el paso 3) |
| **3** | **Primer código real: `core/geography.ts` (TopoJSON → GeoJSON)** | ✅ Hecho                                               |
| 4     | `core/join.ts`: cruzar datos con regiones + diagnóstico          | ✅ Hecho                                               |
| 5     | Paletas, clasificación y escalas                                 | ✅ Hecho                                               |
| 6     | Proyección y primer mapa visible                                 | ✅ Hecho                                               |
| 7     | `core/legend.ts`: leyenda con conteos                            | ✅ Hecho                                               |
| 8     | React nivel 3 (headless): `use-container-size` + `useChoropleth` | ✅ Hecho                                               |
| 9     | React nivel 2: compound (`Choropleth.Root` + piezas)             | ✅ Hecho                                               |
| 10    | React nivel 1: preset `<ChoroplethMap>`                          | ✅ Hecho                                               |
| 11    | Diagnóstico en consola + `onJoinReport`                          | ✅ Hecho                                               |
| 12    | CSS y theming (`styles.css`, `--cm-*`, `unstyled`)               | ✅ Hecho                                               |
| 13    | Presets por variant: `categorical` y `bubble`                    | ✅ Hecho                                               |
| R     | **Revisión de Opus 5.5** (al final de este diario)               | ✅ Hecha: leer antes del paso 14                       |

**Fase A, cimientos (v0.2)**: lo que el zoom y el drill-down necesitan que esté bien.

| Paso | Título                                                                                            | Estado     |
| ---- | ------------------------------------------------------------------------------------------------- | ---------- |
| 14   | Limpieza: borrar `placeholder`; `@types/geojson` y `topojson-specification` a `dependencies`      | ✅ Hecho   |
| 15   | `map-store`: hover, foco, puntero y estado fuera de `Root`                                        | ✅ Hecho   |
| 16   | `MapItem` unificado (regiones + puntos) y Pointer Events                                          | ✅ Hecho   |
| 17   | Selección controlada / no controlada y `dimOthers`                                                | ✅ Hecho\* |
| 18   | `labels` (i18n): fuera los textos en español fijos                                                | ✅ Hecho\* |
| 19   | Geometría robusta: regiones sin id, `filterFeatures`, trazos no escalables, `aspectRatio: "auto"` | ✅ Hecho\* |
| 20   | `getFocusGeometry` + anclas `polylabel`                                                           | ✅ Hecho\* |
| 21   | `geography` asíncrona con caché + `data: undefined` = cargando                                    | ✅ Hecho\* |
| 22   | `src/geo`: `world-110m` alpha-2, tabla ISO, `fallbackPoints`                                      | ✅ Hecho\* |

**Fase B, cámara (v0.3)**: zoom y pan (tareas 10-14 de `dd.md §21`).

| Paso | Título                                                                                                   | Estado       |
| ---- | -------------------------------------------------------------------------------------------------------- | ------------ |
| 23   | `core/camera.ts` y `boundsToTransform`: la matemática de la cámara, solo con tests                       | ✅ Hecho     |
| 24   | `use-zoom.ts` + `Viewport`: `d3-zoom` escribe el transform en el DOM; rueda cooperativa, clic ≠ arrastre | ✅ Hecho\*   |
| 25   | `ZoomControls`, `GestureHint` y teclado de zoom                                                          | ✅ Hecho\*   |
| 26   | Vuelos: `focusId`, handle `zoomTo` / `zoomBy` / `resetView` con `Promise`, reduced-motion                | ✅ Hecho\*   |
| 27   | Contraescalado de burbujas, inercia y resize sin salto                                                   | ⏳ Pendiente |

**Fase C, drill-down (v0.4)** · **Fase D, pulido visual (v0.5)**: pasos 28-37, en el orden exacto de las
tareas 15-24 de `dd.md §21`. Cada uno se añade a esta tabla al empezarlo.

---

# Paso 1: Scaffolding

## 1.1 Qué es una librería y en qué se diferencia de una aplicación

Si vienes de crear aplicaciones, lo único que cambia es **quién ejecuta tu código y cómo llega a él**.

|                     | Aplicación                           | Librería                                                       |
| ------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Resultado del build | Una web que se despliega (HTML + JS) | Archivos JS + tipos (`.d.ts`) que **otros proyectos importan** |
| Quién la "arranca"  | El navegador                         | Otro proyecto, con `import { ... } from "choropleth-kit"`      |
| Punto de entrada    | `index.html` + `main.tsx`            | Un `index.ts` que **exporta** cosas                            |
| React               | Es una dependencia más               | Es una **peerDependency**: la pone el consumidor, no nosotros  |
| Dependencias        | Todas se empaquetan                  | Solo las propias (`d3-geo`…); React **no** se empaqueta        |
| ¿Cómo la pruebo?    | Ejecutando la app                    | Con **tests** y con un entorno aislado (**Storybook**)         |

Consecuencia práctica: una librería necesita **tres cosas que una app no necesita**:

1. **Un bundler de librerías** que convierta nuestro TypeScript en JS publicable y genere los tipos.
2. **Un `package.json` con `exports`** que diga qué se puede importar desde fuera.
3. **Un sitio donde verla funcionar** sin tener una app detrás: Storybook.

## 1.2 Las herramientas elegidas y por qué

| Herramienta                  | Rol                                                | Por qué esta y no otra                                                                                           |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **TypeScript**               | Lenguaje y comprobación de tipos                   | Los tipos genéricos (`TDatum`) son parte clave de la API (§9.2 de `dd.md`).                                      |
| **tsup**                     | **Bundler**: TS → JS + `.d.ts`                     | Una sola config de pocas líneas. Es una de las dos opciones que propone `dd.md` (la otra es Vite library mode).  |
| **Vitest**                   | Ejecutor de **tests unitarios**                    | Misma sintaxis que Jest, pero entiende TypeScript y ESM sin configuración extra (importante: d3 v7 es solo ESM). |
| **jsdom**                    | Un "navegador falso" dentro de Node                | Permite renderizar componentes React en los tests sin abrir un navegador.                                        |
| **React Testing Library**    | Utilidades para testear componentes                | Prueba lo que ve el usuario (texto, roles), no detalles internos.                                                |
| **Storybook** (`react-vite`) | **Sandbox** para ver y probar componentes aislados | Es nuestra "app de pruebas". Cada _story_ es un ejemplo del componente. También servirá de documentación.        |
| **Vite**                     | Servidor de desarrollo de Storybook                | Lo usa Storybook por debajo. No lo usamos para el build de la librería (eso lo hace tsup).                       |

> **Dos "builds" distintos, no te líes.**
> `pnpm build` → **tsup** → genera `dist/`, que es **lo que se publicaría**.
> `pnpm build-storybook` → **Vite** → genera `storybook-static/`, una web de demos que **no se publica en npm**.

## 1.3 Estructura de carpetas

```
choropleth-kit/
├── src/                      ← TODO el código de la librería
│   ├── core/                 ← funciones puras: sin React, sin DOM
│   │   └── index.ts          ← "puerta de entrada" de @…/core
│   ├── react/                ← componentes y hooks que usan core
│   │   ├── components/       ← (vacía por ahora) regions, legend, tooltip…
│   │   └── index.ts          ← "puerta de entrada" del paquete principal
│   └── geo/                  ← (vacía por ahora) geodatos opcionales
├── scripts/build-geo/        ← (vacía por ahora) scripts de build de geodatos
├── stories/                  ← ejemplos para Storybook
├── tests/                    ← configuración de tests (y tests que no pertenezcan a un archivo concreto)
├── .storybook/               ← configuración de Storybook
├── dist/                     ← salida del build (generada, no se edita, no se sube a git)
└── (archivos de configuración en la raíz)
```

Decisiones de estructura (vienen de §8.3 y §8.4 de `dd.md`):

- **`core` y `react` están separados a propósito.** `core` no puede importar React ni tocar el DOM. Así
  es fácil de testear (son funciones que reciben datos y devuelven datos) y, en el futuro, podrá
  usarse desde vanilla JS, Vue, etc. Esta separación es **la decisión de arquitectura más importante**
  del proyecto.
- **Los tests unitarios viven junto al código** (`placeholder.test.ts` al lado de `placeholder.ts`).
  Es más fácil encontrarlos y no olvidarlos. `tests/` queda solo para la configuración compartida.
- **Los playgrounds de `dd.md` los sustituye Storybook** (decisión tuya). Por eso no hay carpeta
  `playground/`.
- Las carpetas vacías llevan un archivo `.gitkeep` (git no guarda carpetas vacías; ese archivo es solo
  para que la estructura exista). Se borrará cuando haya contenido real.

### Código provisional (se borra en el paso 2)

Para **demostrar que toda la cadena funciona** (tipos → tests → build → Storybook) hay un código mínimo
sin valor real:

| Archivo                           | Qué es                                                 |
| --------------------------------- | ------------------------------------------------------ |
| `src/core/placeholder.ts`         | Una función pura que devuelve el nombre de la librería |
| `src/core/placeholder.test.ts`    | Su test unitario (entorno Node/jsdom)                  |
| `src/react/placeholder.tsx`       | Un componente que **importa de `core`** y lo pinta     |
| `src/react/placeholder.test.tsx`  | Su test con React Testing Library                      |
| `stories/placeholder.stories.tsx` | Su _story_ en Storybook                                |

Fíjate en que `placeholder.tsx` importa de `../core`: es exactamente la relación `react → core` que
tendrá todo el proyecto.

## 1.4 Los archivos de configuración, uno a uno

### `package.json`: el documento de identidad de la librería

Lo importante para una librería (y que no tiene una app):

```jsonc
{
  "name": "choropleth-kit",        // PROVISIONAL: el nombre definitivo y el scope los decides tú
  "license": "MIT",                // PROVISIONAL: a confirmar (en tu empresa, con OSPO/Legal)
  "type": "module",                // los .js de este proyecto son módulos ES (import/export)
  "sideEffects": ["**/*.css"],     // ver abajo
  "files": ["dist"],               // lo ÚNICO que se subirá a npm
  "exports": { ... },              // qué se puede importar desde fuera (ver abajo)
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" }
}
```

- **`"type": "module"`**: le dice a Node que `import/export` es el formato por defecto. d3 v7 solo
  existe como módulo ES, así que es lo coherente.
- **`"files": ["dist"]`**: al publicar, solo viaja `dist/`. Nada de `src`, tests ni configs.
- **`"sideEffects"`**: pista para los bundlers de quien nos use. Dice "todo mi código se puede
  eliminar si no se usa (_tree-shaking_), **excepto los CSS**, que cuentan aunque nadie use una
  variable de ellos". Si no lo pusiéramos, el bundler podría tirar nuestro CSS.
- **`peerDependencies`**: "necesito React, pero **el proyecto que me use debe ponerlo**". Si
  empaquetáramos nuestra propia copia de React, habría dos Reacts en la app y los hooks fallarían de
  formas muy confusas. Por eso `react` está en `peerDependencies` **y** en `devDependencies` (esta
  última solo para poder desarrollar y testear aquí).
- **`exports`** (el campo más importante, con diferencia):

  ```jsonc
  "exports": {
    ".":      { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./core": { "types": "./dist/core.d.ts",  "import": "./dist/core.js"  }
  }
  ```

  Es el **mapa de lo que el consumidor puede importar**:

  | El consumidor escribe                           | Recibe                          |
  | ----------------------------------------------- | ------------------------------- |
  | `import … from "choropleth-kit"`                | `dist/index.js`                 |
  | `import … from "choropleth-kit/core"`           | `dist/core.js`                  |
  | `import … from "choropleth-kit/src/lo-que-sea"` | ❌ **error**: no está exportado |

  Es una forma de **definir la API pública**: lo que no está en `exports` no se puede importar, así que
  podemos reorganizar el interior sin romper a nadie. `"types"` va **primero** porque TypeScript lee
  las condiciones en orden y se queda con la primera que le sirve.

- **`main` y `types`** (en la raíz) son un respaldo para herramientas antiguas que no entienden `exports`.

**Scripts:**

| Comando                | Qué hace                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `pnpm build`           | Compila la librería a `dist/` (tsup)                                  |
| `pnpm dev`             | Igual, pero recompila al guardar                                      |
| `pnpm typecheck`       | Comprueba los tipos sin generar nada (`tsc --noEmit`)                 |
| `pnpm test`            | Ejecuta todos los tests una vez                                       |
| `pnpm test:watch`      | Tests en modo vigilancia: se repiten al guardar                       |
| `pnpm test:coverage`   | Tests + informe de cobertura (falla si `src/core` baja del 90 %)      |
| `pnpm storybook`       | Arranca Storybook en http://localhost:6006                            |
| `pnpm build-storybook` | Genera Storybook como web estática (sirve para comprobar que compila) |

### `tsconfig.json`: reglas de TypeScript

Un punto clave: **TypeScript aquí solo comprueba tipos** (`"noEmit": true`). No genera JS; eso lo hace
tsup. Por eso se ejecuta con `pnpm typecheck`.

| Opción                                                             | Para qué sirve                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `"strict": true`                                                   | Todas las comprobaciones estrictas (obligatorio según `dd.md`).                                                                 |
| `"noUncheckedIndexedAccess": true`                                 | `array[0]` pasa a tener tipo `T \| undefined`. Evita muchos errores con listas y mapas. Añadido por nosotros (extra a `dd.md`). |
| `"moduleResolution": "Bundler"`                                    | Cómo resuelve TypeScript los `import`: como lo hacen los bundlers modernos (sin exigir extensión `.js`).                        |
| `"jsx": "react-jsx"`                                               | Transformación moderna de JSX: no hay que escribir `import React` en cada archivo.                                              |
| `"isolatedModules": true`                                          | Cada archivo debe poder compilarse por separado (lo exigen tsup, Vite y Vitest, que transforman archivo a archivo).             |
| `"verbatimModuleSyntax": true`                                     | Obliga a escribir `import type { … }` cuando solo se importan tipos. Evita imports muertos en el JS final.                      |
| `"skipLibCheck": true`                                             | No revisa los `.d.ts` de `node_modules`. Más rápido y evita errores ajenos.                                                     |
| `"types": ["node", "vitest/globals", "@testing-library/jest-dom"]` | Qué tipos globales hay disponibles: `describe/it/expect` sin importarlos, y matchers como `toBeInTheDocument()`.                |
| `"include": [...]`                                                 | Qué carpetas revisa: `src`, `tests`, `stories`, `.storybook` y los `*.config.ts` de la raíz.                                    |

### `tsup.config.ts`: el bundler

```ts
export default defineConfig({
  entry: { index: "src/react/index.ts", core: "src/core/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
});
```

- **`entry`**: los "puntos de entrada". Cada clave es el nombre del archivo de salida: `index` →
  `dist/index.js`, `core` → `dist/core.js`. **Coinciden con los de `exports` en `package.json`**; si
  cambias uno, cambia el otro.
- **`format: ["esm"]`**: solo módulos ES. `dd.md §20` pide "build ESM + `.d.ts`". Si algún consumidor
  necesitara CommonJS, se añade `"cjs"` aquí.
- **`dts: true`**: genera los archivos de tipos (`.d.ts`). Sin ellos, TypeScript no sabría qué hay en la
  librería.
- **`sourcemap`**: permite depurar el código original desde las DevTools del consumidor.
- **`clean`**: vacía `dist/` antes de cada build, para que no queden archivos viejos.
- **`external`**: **no empaquetar** React. Es la contrapartida de `peerDependencies`.

Verás en `dist/` un archivo `chunk-XXXX.js`: es código compartido entre `index` y `core` que tsup
extrae para no duplicarlo. Es normal.

### `vitest.config.ts` + `tests/setup.ts`: tests

- **`environment: "jsdom"`**: los tests corren con un DOM falso, necesario para renderizar React.
- **`globals: true`**: `describe`, `it` y `expect` están disponibles sin importarlos (por eso el
  `tsconfig` incluye `vitest/globals`).
- **`setupFiles`**: código que se ejecuta antes de cada archivo de test. El nuestro (`tests/setup.ts`)
  registra los matchers de `jest-dom` (`toBeInTheDocument`, `toHaveAttribute`…).
- **`include`**: busca tests con patrón `*.test.ts(x)` en `src/` y `tests/`.
- **`coverage`**: mide qué porcentaje del código ejecutan los tests.
  - Solo mide `src/core` (donde está "la mayor parte del valor" según §15 de `dd.md`).
  - **`thresholds` 90 %**: si baja, `pnpm test:coverage` **falla**. Es el criterio de aceptación
    "cobertura de `src/core` ≥ 90 %" hecho automático.
  - Excluye `index.ts` (solo reexporta) y `*.types.ts` (solo tipos, no hay nada que ejecutar).

### `.storybook/main.ts` y `.storybook/preview.ts`: el sandbox

- **`main.ts`**: decide **dónde buscar stories** (`stories/**/*.stories.ts(x)`) y qué **framework**
  usar (`@storybook/react-vite`: React + Vite).
- **`preview.ts`**: opciones globales de cómo se muestran. De momento solo `layout: "fullscreen"`
  (el canvas sin márgenes: un mapa necesita todo el espacio). Aquí irán más adelante decoradores,
  estilos globales o el tema.
- Una **story** (`stories/*.stories.tsx`) es un archivo que dice "este componente, con estas props".
  Cada export (`Default`, …) es un ejemplo navegable en la barra lateral de Storybook.

### `.gitignore`

Lo que no se sube al repositorio, porque se **regenera**: `node_modules`, `dist`, `coverage`,
`storybook-static`.

## 1.5 Cómo comprobar que todo funciona

Ejecútalo tú, en la carpeta `choropleth-kit/`:

| Comando              | Resultado esperado                                                       |
| -------------------- | ------------------------------------------------------------------------ |
| `pnpm typecheck`     | Sin salida (silencio = correcto)                                         |
| `pnpm test`          | `2 passed`                                                               |
| `pnpm test:coverage` | 100 % en `core` (hay un solo archivo)                                    |
| `pnpm build`         | Crea `dist/` con `index.js`, `core.js`, sus `.d.ts` y sourcemaps         |
| `pnpm storybook`     | Abre http://localhost:6006; en la barra lateral: **Setup → Placeholder** |

Prueba extra que merece la pena entender: la librería **se puede importar como lo haría un consumidor**.

```bash
node -e "import('./dist/core.js').then(m => console.log(m.describeLibrary()))"
# → choropleth-kit
```

**Experimentos recomendados** (rompe algo a propósito para ver cómo reacciona cada herramienta):

1. En `src/core/placeholder.ts`, cambia el texto devuelto → `pnpm test` falla y te dice qué esperaba.
2. Pon `const x: number = "hola"` en cualquier archivo → `pnpm typecheck` falla.
3. En `placeholder.tsx`, cambia el texto con Storybook abierto → se actualiza solo en el navegador.

## 1.6 Decisiones y problemas encontrados

Cosas que **no están en `dd.md`** o que se desviaron de él, y por qué:

| Decisión                                     | Motivo                                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript fijado en `~5.9.3`, no la 7.x** | La 7 (compilador nativo) **no incluye la API JavaScript** que tsup necesita para generar `.d.ts`: el build fallaba. `~` permite parches 5.9.x pero no saltar a la 6. Revisar cuando tsup lo soporte. |
| **`jsdom` en la 27, no la 30**               | La 30 exige Node 22.22+/24.15+/26+. Tu Node es **23.5** (una versión "impar", sin soporte a largo plazo) y fallaba al arrancar.                                                                      |
| **Gestor de paquetes: pnpm**                 | Migrado desde npm. `packageManager` fija `pnpm@12.6.0` y un `preinstall` rechaza `npm`/`yarn`. El workaround `--legacy-peer-deps` ya no aplica.                                                      |
| **Solo formato ESM**                         | `dd.md §20` pide ESM + `.d.ts`. d3 v7 ya es solo ESM, así que ofrecer CJS apenas ayuda.                                                                                                              |
| **Storybook en lugar de `playground/`**      | Petición tuya. Cumple el mismo papel (ver la librería con datos sintéticos) y además sirve de documentación.                                                                                         |
| **`noUncheckedIndexedAccess` activado**      | Extra de seguridad respecto a `dd.md`. Si resulta incómodo, se desactiva en `tsconfig.json`.                                                                                                         |
| **Nombre `choropleth-kit` y licencia MIT**   | **Provisionales.** Comprobado que `choropleth-kit` no existe en npm, pero `dd.md §20` dice que el nombre, el scope y la licencia los decide una persona.                                             |
| **Sin ESLint/Prettier todavía**              | No se pidió; añadirlos ahora sería otro paso más que explicar. Candidato para un paso posterior.                                                                                                     |
| **Sin `size-limit` ni Changesets todavía**   | Son de la fase v1.0 en el roadmap (§17). No tiene sentido medir el peso de una librería vacía.                                                                                                       |

**Avisos de seguridad de `pnpm audit`:** pueden aparecer avisos de severidad baja/moderada en herramientas de
desarrollo de Storybook y del bundler (`esbuild`, `glob`, `minimatch`). **No se distribuyen con la
librería** (`files` solo incluye `dist`), así que no afectan a quien la use. Se revisarán al actualizar
Storybook. Evita `pnpm audit --fix` a ciegas: puede romper versiones.

## 1.7 Pendiente / preguntas para ti

1. **¿Nombre y licencia definitivos?** Puede esperar, pero conviene decidirlo antes de publicar.
2. ~~**¿Inicializamos git?**~~ Resuelto: el proyecto ya es un repositorio con remoto (`origin/master`).
3. **¿Quieres soportar React 17?** `dd.md §20` lo pregunta. Ahora mismo declaramos `react >=18`.
4. **Node 23.5**: funciona, pero no es LTS. Tienes instaladas la 22.13.1 y la 20.11.0 con nvm. Para un
   proyecto que quieras mantener, lo recomendable es una LTS (22 o 24).

## 1.8 Antes de pasar al paso 2: ¿lo tienes claro?

Comprueba que puedes responder, con tus palabras:

- ¿Por qué `react` está a la vez en `peerDependencies` y en `devDependencies`?
- ¿Qué diferencia hay entre `pnpm build` y `pnpm build-storybook`?
- ¿Para qué sirve `exports` y qué pasaría si un consumidor intentara importar `choropleth-kit/src/core`?
- ¿Por qué `core` no puede importar React?
- ¿Por qué los tests están al lado del código y no en una carpeta aparte?

---

# Paso 2: Dependencias mínimas para el primer mapa

> **Objetivo:** instalar **solo** lo imprescindible para pintar un mapa del mundo coloreado por datos
> (la "mínima visualización"). Nada de zoom, leyenda ni tooltips: eso llegará en pasos posteriores
> (`d3-zoom` en v0.2, `d3-array` cuando haga falta calcular rangos…). Instalar de más ahora sería
> cargar con paquetes que aún no sabemos usar.

## 2.1 La cadena de montaje: de un archivo a píxeles

Un mapa coropleta es una **cadena de transformaciones**. Cada paquete nuevo es un eslabón:

```
 world-atlas            topojson-client         d3-geo               d3-scale +            React
 ───────────            ───────────────         ──────               d3-scale-chromatic    ─────
 countries-110m.json ─► feature() ───────────► geoPath(proyección) ─► color por valor ────► <path d=… fill=…/>
 (TopoJSON: formas      GeoJSON: lista de      string SVG "M10,20L…"  "rgb(109,174,213)"   dentro de un <svg>
  comprimidas)          países con geometría   por cada país          por cada país
```

1. **Geometría (datos):** `world-atlas` aporta las formas de los países.
2. **Descompresión:** `topojson-client` convierte ese formato compacto en GeoJSON, que sí se puede dibujar.
3. **Proyección:** `d3-geo` convierte coordenadas de la Tierra (longitud/latitud) en puntos de una
   pantalla plana y las traduce al atributo `d` de un `<path>` SVG.
4. **Color:** `d3-scale` mapea un valor numérico (p. ej. población) a un número entre 0 y 1;
   `d3-scale-chromatic` convierte ese número en un color de una paleta científica.
5. **Render:** React no necesita ningún paquete extra: pinta un `<svg>` con un `<path>` por país.
   **d3 calcula, React dibuja.** (Detalle importante: no usamos `d3-selection`, ver §2.4.)

## 2.2 Qué se ha instalado y por qué

### `dependencies`: viajan con la librería (las instalará quien nos use)

| Paquete                  | Versión | Qué hace                                                                                                     | Por qué es necesario                                                                                                                                    |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`d3-geo`**             | 3.1.2   | Proyecciones (`geoNaturalEarth1`, `geoMercator`…) y `geoPath`, que genera el texto del atributo `d` del SVG. | Es el **corazón**: sin él no hay forma de pasar de "lat/lon" a "píxeles". `fitSize` encaja el mapa en el contenedor automáticamente.                    |
| **`topojson-client`**    | 3.1.0   | `feature()` convierte TopoJSON → GeoJSON (también `mesh` y `merge`, que usaremos más adelante).              | Los geodatos se **distribuyen** como TopoJSON (pesan mucho menos porque las fronteras compartidas se guardan una vez) pero se **dibujan** como GeoJSON. |
| **`d3-scale`**           | 4.0.3   | Escalas: función que convierte un valor de datos en otra cosa (`scaleSequential`, `scaleQuantize`…).         | Es lo que hace que sea un mapa **coropleta** y no solo un mapa: asigna un color según el dato. Las clasificaciones (quantile, threshold…) viven aquí.   |
| **`d3-scale-chromatic`** | 3.1.1   | Paletas ya hechas: ColorBrewer (`interpolateBlues`, `schemeBlues`…) y Viridis.                               | Elegir colores a mano es fácil de hacer mal (no distinguibles, no aptos para daltonismo). Estas paletas están diseñadas y validadas para cartografía.   |

Los cuatro son módulos d3 **sueltos**, nunca el paquete `d3` completo (regla de `dd.md §20`): así el
consumidor solo descarga lo que usamos (_tree-shaking_).

### `devDependencies`: solo para desarrollar aquí, no viajan

| Paquete                                                                                                   | Qué hace                                                                                               | Por qué es necesario                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`world-atlas`** 2.0.2                                                                                   | JSON con las formas de los países (Natural Earth). Usamos `countries-110m.json` (177 países, ~100 KB). | Es el **dato de prueba** para la story. Está en `dev` porque la librería **no impone ningún geodato** (acepta cualquier GeoJSON/TopoJSON, `dd.md §20`): el usuario trae el suyo. Más adelante daremos geodatos opcionales propios. |
| **`@types/d3-geo`**, **`@types/d3-scale`**, **`@types/d3-scale-chromatic`**, **`@types/topojson-client`** | Declaraciones de tipos de cada paquete (los d3 están escritos en JS, sin tipos propios).               | Sin ellos, `tsc` no sabe qué devuelve `geoPath()` y `strict` rechaza el import. Es lo que da autocompletado y errores en el editor.                                                                                                |
| **`@types/geojson`**, **`@types/topojson-specification`**                                                 | Los tipos `FeatureCollection`, `Feature`, `Topology`…                                                  | Los dos anteriores dependen de ellos, pero **pnpm no deja importar paquetes que no declaras** (ver §2.3), así que los pedimos explícitamente para poder escribir `import type { FeatureCollection } from "geojson"`.               |

> **Pendiente de decidir antes de publicar:** los tipos `FeatureCollection`/`Topology` aparecerán en la
> API pública (los `.d.ts`). Cuando eso ocurra, `@types/geojson` y `@types/topojson-specification`
> probablemente deban pasar a `dependencies`, para que los consumidores con TypeScript no vean `any`.
> Hoy no hay API pública con ellos, así que se queda en `dev`.

## 2.3 Detalle de pnpm que conviene entender

pnpm instala de forma **estricta**: en `node_modules/` solo ves lo que has declarado en `package.json`
(el resto vive en `node_modules/.pnpm/`). Con npm, un paquete "colado" por ser dependencia de otro se
podía importar sin declararlo (_phantom dependency_) y la librería funcionaba **por casualidad**; en
cuanto un consumidor la instalaba, fallaba. Con pnpm ese error aparece desde el primer día. Por eso
declaramos `@types/geojson` aunque ya llegara indirectamente.

## 2.4 Lo que NO hemos instalado (a propósito)

| Paquete                                      | Por qué no, todavía                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `d3` (completo)                              | Prohibido por `dd.md`: arrastra decenas de módulos que no usamos.                                                                 |
| `d3-selection`                               | d3 manipula el DOM por su cuenta; React también. Si compiten, hay bugs. React crea los `<path>`; d3 solo calcula números/strings. |
| `d3-array`                                   | Útil para `extent()` (mínimo y máximo), pero en el mapa mínimo un dominio fijo basta. Entrará con el módulo de clasificación.     |
| `d3-zoom`, `d3-transition`, `d3-interpolate` | Son de v0.2 (zoom y pan).                                                                                                         |
| `d3-composite-projections`                   | Solo para vistas de España con Canarias; no hace falta para el mapa del mundo.                                                    |
| `@turf/*`, `supercluster`, `d3-delaunay`     | Fases posteriores (reparar geometrías, clustering de tiendas, Voronoi).                                                           |

## 2.5 Cómo comprobar que funciona

Los paquetes están instalados, pero **aún no hay código nuestro que los use**. La comprobación hecha es un
script desechable que ejecuta toda la cadena de §2.1 en Node:

```js
const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-110m.json"));
const fc = feature(topo, topo.objects.countries); // topojson-client
const path = geoPath(geoNaturalEarth1().fitSize([960, 500], fc)); // d3-geo
path(fc.features[0]); // → "M953.907,300.856L954.699,…"
scaleSequential([0, 1], interpolateBlues)(0.5); // d3-scale(+chromatic) → "rgb(109, 174, 213)"
```

Resultado: **177 países**, un `d` de SVG válido y un color. Es decir, la cadena completa funciona; solo falta
envolverla en funciones de `core` y en un componente React.

Para repetirlo tú: `pnpm ls --depth 0` debe listar los cuatro paquetes en `dependencies`.

## 2.6 Antes de pasar al paso 3: ¿lo tienes claro?

- ¿Por qué se distribuye TopoJSON y se dibuja GeoJSON?
- ¿Qué recibe y qué devuelve `geoPath`? ¿Y una escala de `d3-scale`?
- ¿Por qué `world-atlas` está en `devDependencies` y `d3-geo` en `dependencies`?
- ¿Por qué no usamos `d3-selection` si ya tenemos React?
- ¿Qué es una _phantom dependency_ y cómo la evita pnpm?

---

# Paso 3: `toFeatureCollection` (primer código real)

Archivos: `src/core/geography.ts` y `src/core/geography.test.ts`, exportada desde `src/core/index.ts`.

## 3.1 Qué hace

```ts
toFeatureCollection({ geography, objectName? }): FeatureCollection
```

Recibe geodatos en **cualquiera de los dos formatos** y devuelve **siempre GeoJSON `FeatureCollection`**:

| Entrada                             | Qué ocurre                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| GeoJSON `FeatureCollection`         | Se devuelve **el mismo objeto**, sin tocarlo.                                                       |
| TopoJSON `Topology`                 | Se elige un objeto (`objectName`, o el primero), se convierte con `topojson-client` y se normaliza. |
| Cualquier otra cosa (`null`, `{}`…) | Error claro: "formato no reconocido".                                                               |
| `objectName` que no existe          | Error que **lista los objetos disponibles**.                                                        |

Es la puerta de entrada de los geodatos: el join con los datos, la proyección y el render pueden asumir
`FeatureCollection` y no volver a preguntarse qué formato les dieron. Es pura y síncrona (sin fetch); la
carga diferida `() => import(...)` se resolverá en la capa React.

## 3.2 Por qué el orden interno es ese

El código está comentado paso a paso; este es el resumen. **Cada paso depende de que el anterior haya
validado algo**, por eso no se puede reordenar:

| #   | Paso                                    | Por qué va aquí                                                                                                                         | Qué pasaría si se invierte                                                                                         |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Leer `type` (el discriminante)          | Los dos formatos tienen forma incompatible (`objects`+`arcs` vs `features`). Hay que saber cuál es antes de tocar nada.                 | Llamar a `feature()` con un GeoJSON da un error críptico interno, lejos de la causa.                               |
| 2   | Atajo GeoJSON: devolver el mismo objeto | Es el camino barato y debe ir antes del trabajo de TopoJSON.                                                                            | Si se **copiara**, cada render daría una referencia nueva → `useMemo` recalcularía todos los `path` en cada hover. |
| 3   | Rechazar lo que no sea `Topology`       | Tras el paso 2, lo que queda debe ser TopoJSON; si no, es un error del llamador y se dice así.                                          | Se buscarían `objects` en algo que no los tiene (`TypeError` sin contexto).                                        |
| 4   | Elegir el objeto (`objectName`)         | Solo tiene sentido en una `Topology` ya validada. world-atlas trae `countries` y `land`: elegir mal pinta un solo polígono sin ids.     | `feature()` recibiría `undefined`.                                                                                 |
| 5   | `feature()` → normalizar                | Va **último** porque su resultado depende del objeto: una colección da `FeatureCollection`, una geometría única da un `Feature` suelto. | Devolver el `Feature` tal cual haría romper `.features.map(...)` solo con algunos geodatos.                        |

## 3.3 Impacto real, comprobado

Cosas que se verificaron en el build, no solo se supusieron:

- **Los `import type` desaparecen.** En `dist/` el único import de runtime es
  `import { feature } from "topojson-client"`. Los tipos de `geojson` y `topojson-specification` no cuestan
  nada en ejecución.
- **`topojson-client` queda como import externo, no copiado.** tsup lo deja sin empaquetar porque está en
  `dependencies`; el gestor de quien nos use lo instalará. Por eso `topojson-client` debe estar ahí y no en `dev`.
- **Con datos reales** (`world-atlas`): `countries` → 177 features; `land` → 1 feature `MultiPolygon`,
  que es justo el caso que el paso 5 envuelve.
- **Referencia estable:** hay un test que comprueba con `toBe` (identidad, no igualdad) que el GeoJSON
  vuelve sin copiar. Es la base del criterio "cambiar indicador no recalcula rutas" de `dd.md §20`.

## 3.4 Tests

Un TopoJSON mínimo **escrito a mano**: dos cuadrados pegados cuyo lado común se guarda **una sola vez**
(`arcs[0]`); un cuadrado lo recorre hacia delante y el otro hacia atrás (`~0`). Es la mejor forma de ver
en pequeño por qué TopoJSON pesa menos. Se prueba: ids y properties, reconstrucción exacta de
coordenadas, `objectName`, envoltorio de geometría única, **deshacer `transform`** (cuantización +
delta-encoding, como traen los archivos reales), GeoJSON sin copiar y los errores.

Resultado: 15 tests en verde, `typecheck` limpio, **100 % de cobertura** en `src/core`.

## 3.5 Decisiones

- **Se aceptan solo `Topology` y `FeatureCollection`**, como pide `dd.md §9.2`. Un `Feature` suelto o un
  `GeometryCollection` GeoJSON dan error en vez de adivinar; se pueden aceptar más adelante si hace falta.
- **No se valida el contenido** de las features (que tengan `geometry`, ids…). Eso es responsabilidad del
  diagnóstico de join (paso 4) y de los avisos de desarrollo.
- **El código provisional `placeholder` se mantiene** (a diferencia de lo anunciado en el paso 2): la story
  de Storybook depende de él y aún no hay un componente real que la sustituya. Se borrará cuando exista.
- **Comentarios más abundantes de lo que pide `dd.md §20`** ("solo el porqué no evidente"): decisión tuya,
  por ser un proyecto didáctico. Cuando termine el aprendizaje se pueden podar.

## 3.6 Antes de pasar al paso 4: ¿lo tienes claro?

- ¿Por qué devolver el mismo objeto GeoJSON en lugar de una copia? ¿Qué se rompería?
- ¿Qué diferencia hay entre `countries` y `land` en `world-atlas`, y por qué eso obliga al paso 5?
- ¿Por qué `topojson-client` es `dependency` y `@types/geojson` es `devDependency`?
- ¿Qué guarda `arcs[0]` en el test y por qué B lo recorre con `~0`?

---

# Paso 4: `joinData` (cruzar datos y regiones)

Archivos: `src/core/join.ts` y `src/core/join.test.ts`, exportada desde `src/core/index.ts`.

## 4.1 Qué problema resuelve

Tu dato dice `{ code: "ES", value: 4.2 }` y la geometría tiene un polígono con `id: "724"`. Para colorear
España hay que **unirlos (_join_)** por un identificador común. Si no coinciden, el mapa sale **gris sin
ningún error**: es la causa n.º 1 de "mi mapa no funciona" (`dd.md §2.8`).

```ts
joinData({ features, data, getId, getFeatureId? }) → {
  joined: Map<id, datum>,        // cruces que SÍ ocurrieron (lo que el render consultará)
  unmatchedData: string[],       // datos sin región ("ES" cuando la geometría usa "724")
  featuresWithoutData: string[], // regiones sin dato (se pintarán con emptyFill)
  duplicateDataIds: string[],    // ids repetidos en data (extra respecto a dd.md, ver §4.4)
}
```

**No adivina ni corrige ids** (lo único que normaliza es `feature.id` → string, para poder comparar): cruza tal cual e **informa**. Corregir en silencio (p. ej. traducir
alpha-2 a numérico) escondería el error; la ayuda para hacerlo es una tabla explícita
(`src/geo/iso-numeric-to-alpha2.ts`, tarea posterior) que el usuario ve y controla.

## 4.2 Por qué el orden interno es ese

| #   | Paso                                                   | Por qué va aquí                                                                                                      | Qué pasaría si se invierte                                                                     |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Sacar los ids de las regiones (`Set`)                  | Hasta saber qué ids existen en la geometría no se puede decir qué dato "sobra".                                      | No habría contra qué comparar en el paso 3.                                                    |
| 2   | Indexar los datos por id (`Map`) y detectar duplicados | Convierte el array en búsqueda O(1). Los duplicados solo se ven al indexar; se conserva el **primero** y se reporta. | Con `data.find()` por región sería O(regiones × datos); y un duplicado se pisaría en silencio. |
| 3   | Clasificar con ambos índices                           | Necesita los dos ya construidos: recorre los datos (¿existe su región?) y las regiones (¿existe su dato?).           | —                                                                                              |

Dos efectos concretos en el código generado:

- **Rendimiento:** `Map`/`Set` hacen que el join cueste O(regiones + datos). Con 177 países da igual; con
  miles de zonas o tiendas, la versión con `find` se notaría en cada recálculo.
- **Estabilidad del render:** `joined` contiene **solo** cruces reales, así que el render hace
  `joined.get(regionId)` sin tener que filtrar datos huérfanos.

## 4.3 Trampas que el código ya cubre

| Trampa                                                           | Qué se hace                                                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature.id` puede ser `724` (number) y el dato `"724"` (string) | Se convierte con `String(...)`. Sin ello `724 !== "724"` en un `Map`: todo gris sin error. Hay test.                                               |
| El id no está en `feature.id` sino en `properties.iso_a2`        | Parámetro `getFeatureId`. Hay test.                                                                                                                |
| Algunas regiones de `world-atlas` no tienen id                   | Se ignoran (no se pueden cruzar ni nombrar en un aviso); se pintarán con `emptyFill` igualmente.                                                   |
| **"Sin dato" ≠ "valor 0" ≠ "valor `null`"**                      | Aquí solo se decide lo primero (no hay fila). Un dato con `value: null` **sí cruza**; convertirlo en `emptyFill` es trabajo de la escala (paso 5). |
| Ceros a la izquierda: `"004"` (Afganistán) ≠ `"4"`               | No se normaliza: el id debe coincidir exactamente. Si los datos vienen de Excel/CSV con ceros perdidos, el aviso lo hará visible.                  |

## 4.4 Decisiones

- **`duplicateDataIds` no está en `dd.md §20`.** Lo añadí porque dos filas con el mismo id son un error
  silencioso (el color dependería del orden). Si prefieres ceñirte al contrato original, se quita en dos líneas.
- **`joinData` es pura: no escribe en consola.** El `console.warn` con pistas (`dd.md §9.6`) y el
  `onJoinReport` son otra tarea (11) que consumirá este resultado. Mantenerlos separados permite testear el
  join sin simular consola ni `process.env`.
- **Se conserva el primer duplicado**, no el último, y se avisa. Es arbitrario pero determinista.

## 4.5 Tests

26 tests en total, **100 % de cobertura** en `src/core`, `typecheck`, `oxlint` y `prettier` limpios. El
test más didáctico usa el `world-atlas` real y reproduce el problema del proyecto: con `"724"` España
cruza; con `"ES"` no cruza y aparece en `unmatchedData`.

## 4.6 Antes de pasar al paso 5: ¿lo tienes claro?

- ¿Por qué `joinData` no traduce `"ES"` a `"724"` por su cuenta?
- ¿Qué diferencia hay entre una región en `featuresWithoutData` y un dato con `value: null`?
- ¿Qué se rompería, sin error visible, si no existiera el `String(feature.id)`?
- ¿Por qué se indexa `data` en un `Map` en vez de buscar con `find` por cada región?

---

# Paso 5: de un valor a un color (paletas, clasificación y escalas)

Archivos: `src/core/palettes.ts`, `classify.ts`, `scales.ts` (+ un `.test.ts` cada uno).
Es el paso que convierte un mapa en un **coropleta**: hasta ahora sabíamos _qué dato va a qué región_
(paso 4); ahora decidimos _de qué color se pinta_.

## 5.1 Las tres piezas y cómo se encadenan

```
 valores del usuario ──► finiteValues ──► dominio ──► computeThresholds ──► colores de la paleta ──► getColor(valor)
 [-20, 3, null, 12]      quita null/NaN   [min,max]   cortes: [-10, 1, 5]    1 color por clase         "rgb(…)" | emptyFill
                                          (simétrico  (classify.ts)          (palettes.ts)             (scales.ts)
                                           si diverg.)
```

| Archivo       | Responde a                            | Devuelve                                                                   |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `palettes.ts` | ¿Qué colores existen?                 | Interpoladores por nombre + muestreo de N colores                          |
| `classify.ts` | ¿Dónde se parten los datos en clases? | **Números** (los cortes), nunca colores                                    |
| `scales.ts`   | ¿De qué color es este valor?          | `createColorScale(...)` → `{ getColor, thresholds, colors, domain, kind }` |

**Por qué `classify` devuelve números y no colores:** se puede testear la estadística sin mirar colores,
y la leyenda (paso siguiente) reutilizará **los mismos cortes y colores** que el mapa, sin recalcular nada.
Por eso `createColorScale` expone `thresholds` y `colors` además de `getColor`.

## 5.2 Conceptos cartográficos que hay que entender

**Variant: ¿qué tipo de dato es?**

| Variant      | Cuándo                                                                | Ejemplo                                                         |
| ------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `sequential` | De menos a más. Un solo color que se intensifica.                     | Población, ventas                                               |
| `diverging`  | Hay un **valor central con significado**; se aleja hacia ambos lados. | Variación respecto al año pasado (−20 … +20), con 0 como centro |

**Método de clasificación: ¿cómo se cortan los datos en clases?**

| Método      | Corta por…                             | Ventaja                               | Riesgo                                                                                                               |
| ----------- | -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `quantile`  | Mismo **nº de regiones** en cada clase | Aprovecha todos los colores           | Un salto de color puede ser una diferencia mínima o enorme; con muchos valores repetidos (ceros) salen clases vacías |
| `quantize`  | Tramos de **igual anchura** del rango  | Fiel a la escala numérica             | Un valor extremo deja casi todo en las primeras clases                                                               |
| `threshold` | Cortes que tú eliges (`[0, 5, 10]`)    | Control total, comparable entre mapas | Hay que saber qué cortes tienen sentido                                                                              |
| `linear`    | No hay clases: degradado continuo      | Máximo detalle                        | Difícil leer un valor concreto y comparar colores                                                                    |

Los defaults vienen de `dd.md`: secuencial → **quantile, 5 clases**; divergente → **quantize sobre un
dominio simétrico, 5 clases**.

## 5.3 Por qué el orden interno es ese (`createColorScale`)

| #   | Paso                             | Por qué va aquí                                                                                                      | Qué pasaría si se invierte                                |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Limpiar valores (`finiteValues`) | Un solo `NaN` contamina mínimo, máximo y cuantiles: todo sería `NaN` y el mapa saldría de un color.                  | Dominio `NaN`, colores incoherentes sin error.            |
| 2   | Dominio                          | Depende de los valores limpios. En divergente se **simetriza** respecto al punto medio.                              | Con datos −20…+5 un +5 parecería tan intenso como un −20. |
| 3   | Cortes (`computeThresholds`)     | `quantize` necesita el dominio; `quantile`, los valores.                                                             | No hay de dónde sacar los cortes.                         |
| 4   | Colores y escala                 | **Nº de colores = nº de cortes + 1**; solo se conoce tras el paso 3. Un `threshold` con 3 cortes da 4 colores, no 5. | Colores de más o de menos respecto a las clases reales.   |

## 5.4 Decisiones con impacto real en lo que se ve

- **"Sin dato" ≠ 0.** `null`, `undefined` y `NaN` → `emptyFill` (`#d4d4d4`). El `0` es un dato y se colorea.
  Hay tests de ambos. Completa lo que `joinData` dejó preparado (región sin fila / fila con `null`).
- **Un valor justo en un corte cae en la clase de arriba** (`d3.scaleThreshold`). Test de bordes incluido:
  con cortes `[0, 10]`, el `0` va a la clase 2 y el `10` a la 3.
- **La rampa secuencial empieza en `t = 0.15`, no en 0.** El extremo claro de ColorBrewer es casi blanco
  (`blues(0) ≈ #f7fbff`); con fondo blanco la clase más baja parecería "sin dato".
- **Divergente: la clase central es el color neutro.** Con 5 clases, `t = 0.1, 0.3, 0.5, 0.7, 0.9`; el
  centro cae en `0.5`. Con `[-20, 20]` los cortes son `[-12, -4, 4, 12]` y el `0` queda en la clase central.
- **`threshold` desordenado lanza error.** d3 no falla: asigna colores equivocados sin avisar.
  Mejor un error claro que un mapa que miente.
- **Paletas tipadas por variant.** `palette: "rdbu"` en un mapa `sequential` **no compila**
  (`@ts-expect-error` en los tests lo vigila). Es un error cartográfico, no solo de estilo.
- **`clamp(true)` en las escalas continuas**: un valor fuera del dominio no extrapola colores fuera de la paleta.

Resultado real comprobado sobre `dist/` con `[-20, -8, 0, 3, 12, null]`:

```
sequential (quantile)  -20→rgb(217,232,245) … 12→rgb(8,48,107)  null→#d4d4d4   (de claro a oscuro)
diverging  (quantize)  -20→rgb(172,32,47) (rojo) · 0→rgb(242,239,238) (neutro) · 12→rgb(34,101,163) (azul)
```

## 5.5 Qué se dejó fuera (a propósito)

| Pendiente                                             | Por qué                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `palette: string[]` (colores propios)                 | `dd.md §9.2` lo contempla; no es necesario para el mapa mínimo y añade casos (¿cuántos colores por clase?).                                |
| Invertir una paleta                                   | `rdbu` va de rojo (bajo) a azul (alto). Para "variación" suele querer lo contrario. Se añadirá con `reverse` cuando haya UI para probarlo. |
| `ckmeans` (Jenks)                                     | Está en el tipo de `dd.md` pero no en las tareas de v0.1.                                                                                  |
| `categorical`                                         | v0.2.                                                                                                                                      |
| Valores `midpoint` por clase en `quantile` divergente | `quantile` no garantiza clases simétricas; sigue permitido, pero el neutro puede no coincidir con el midpoint.                             |

`d3-array` **sigue sin hacer falta**: `scaleQuantile` y `scaleQuantize` ya calculan cuantiles y rangos.

## 5.6 Tests

65 tests en total, `typecheck`, `oxlint` y `prettier` limpios; cobertura de `src/core` 100 % en líneas
y 98,9 % en ramas (umbral: 90 %). Casos clave: cortes de `quantile` frente a `quantize` con un valor extremo,
bordes de clase, simetría del divergente, `midpoint ≠ 0`, todos los valores iguales al medio, ningún valor,
y el error de tipos de paleta equivocada.

## 5.7 Antes de pasar al paso 6: ¿lo tienes claro?

- ¿Por qué `classify` devuelve cortes (números) y no colores?
- Con datos `[1, 2, 3, 4, 5, 6, 7, 8, 9, 1000]` y 2 clases, ¿dónde corta `quantile` y dónde `quantize`? ¿Cuál engaña menos?
- ¿Por qué un mapa de variación necesita dominio simétrico?
- ¿Cuántos colores genera `threshold: [0, 5, 10]` y por qué?
- ¿Qué color recibe un país con valor `0` y cuál uno con `null`?

---

# Paso 6: proyección y primer mapa visible

Archivos: `src/core/projection.ts` + `projection.test.ts`, y la story provisional
`stories/first-map.stories.tsx`. Con este paso **la cadena de `core` queda completa** y por primera vez
se ve un mapa.

## 6.1 Qué hace `createProjection`

```ts
createProjection({ name?, width, height, featureCollection }): GeoProjection
```

Una **proyección** convierte `[longitud, latitud]` en `[x, y]` de píxeles. Aquí se crea una proyección
d3 y se **ajusta** (`fitSize`) para que toda la geometría quepa justa en el contenedor. Sin ese ajuste,
d3 usa una escala fija pensada para 960×500: en otro tamaño el mapa saldría cortado o diminuto.

| `name`                 | Cuándo                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `equalEarth` (defecto) | Mundo. **Áreas iguales**: cada país pesa lo que le corresponde.                                |
| `naturalEarth`         | Mundo, alternativa agradable; deforma algo las áreas.                                          |
| `mercator`             | Infla los polos (Groenlandia ≈ África). Hay una story para verlo; no para coropletas de mundo. |
| `albers`               | EE. UU.                                                                                        |
| `orthographic`         | Globo; solo se ve un hemisferio.                                                               |

**Por qué importa en un coropleta:** el ojo asocia más área pintada con más importancia. Una proyección que
infla Rusia hace que su color "pese" más de lo que debe.

## 6.2 Por qué el orden interno es ese

| #   | Paso                      | Por qué va aquí                                                                                                           | Qué pasaría si se invierte                   |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Validar `width`/`height`  | Con 0 o `NaN` (contenedor oculto o aún sin medir) `fitSize` **no falla**: da escala 0/NaN y cada path sale `"MNaN,NaN…"`. | Mapa invisible, sin ningún error en consola. |
| 2   | Crear una instancia nueva | `fitSize` **modifica** la proyección. Antes del ajuste, porque es lo que se va a mutar.                                   | —                                            |
| 3   | `fitSize`                 | Necesita el tamaño validado y la instancia. Con 0 features se omite (el área vacía daría infinitos).                      | Escala `Infinity`/`NaN` con colección vacía. |

**Dato clave del diseño:** el registro `PROJECTIONS` guarda **fábricas** (`geoEqualEarth`), no instancias.
Una proyección d3 es un objeto mutable; si se compartiera una, dos mapas en la misma página o un mapa que
cambia de tamaño se pisarían la escala. Hay un test: ajustar una proyección a 200×100 no cambia la de 960×500.

## 6.3 La story provisional: el primer mapa

`stories/first-map.stories.tsx` encadena **todo** lo hecho hasta ahora, a mano, en 4 pasos:

```
toFeatureCollection (3) → joinData (4) → createColorScale (5) → createProjection (6) → <path d fill/>
```

Es **lo que luego hará el hook `useChoropleth`** (tarea 8 de `dd.md §20`); está aquí para comprobar que las
piezas encajan antes de construir React encima. Cuando exista `<ChoroplethMap>`, esta story se borra.

Cómo verla: `pnpm storybook` → **Setup → First map (provisional)**. Los controles permiten cambiar variant,
proyección y método de clasificación. Hay tres stories: `Diverging`, `Sequential` y `MercatorInflatesPoles`.

Qué buscar en el mapa (datos **sintéticos**, deterministas por id):

- Cada 7.º país **sin dato** (`null`) en gris `#d4d4d4`, y cada 11.º con valor **0** coloreado: se ve que
  "sin dato" ≠ 0.
- En `Diverging`: rojo para negativos, azul para positivos, neutro cerca de 0.
- Cambia la proyección a `mercator` y compara el tamaño de Rusia, Canadá o Groenlandia con `equalEarth`.

Comprobado automáticamente (renderizando las tres stories en jsdom): **177 `<path>`**, ninguno con `NaN`,
6 fills distintos (5 clases + `emptyFill`) y 26 regiones en gris. El build de Storybook también compila.

> **Importante, y la razón por la que React no necesita nada más:** el componente solo hace
> `world.features.map(f => <path d={toPath(f)} fill={scale.getColor(...)} />)`. d3 calcula, React dibuja.

## 6.4 Decisiones

- **Solo se aceptan proyecciones por nombre** (`name`), como pide la tarea 6 de `dd.md §20`. `dd.md §9.2` también
  permite pasar una instancia `GeoProjection` propia; se dejó fuera porque `fitSize` la mutaría y habría que
  copiarla antes. Se añadirá cuando la prop `projection` exista.
- **Tamaño inválido lanza error** en `core`. La capa React deberá evitar llegar con tamaño 0 (tarea 7: un
  tamaño inicial razonable en el hook de `ResizeObserver`).
- **Colección vacía no lanza error**: devuelve una proyección válida que no pinta nada. Un mapa sin
  geometría es un caso legítimo (datos que aún no han cargado).
- **No se incluye `geoConicConformal`/España con Canarias**; llegará con `d3-composite-projections` si se necesita.
- **La story vive en `stories/` y es descartable**; la lógica de `core` no depende de ella.

## 6.5 Tests

80 tests en total; `typecheck`, `oxlint` y `build-storybook` limpios. Los de proyección comprueban con
`geoPath().bounds()` que la geometría **cabe** en el contenedor y que lo **llena** (todo el ancho o todo el
alto), que la escala crece con el tamaño, el default, las instancias independientes, los tamaños inválidos
y que ninguno de los 177 países produce un path con `NaN`.

## 6.6 Antes de pasar al paso 7: ¿lo tienes claro?

- ¿Por qué `fitSize` está al final y la validación del tamaño al principio?
- ¿Por qué el registro guarda funciones y no proyecciones ya creadas?
- ¿Qué diferencia se ve entre `equalEarth` y `mercator` en la story, y por qué importa en un coropleta?
- En la story, ¿qué hace d3 y qué hace React?
- ¿Cómo distingues en el mapa un país "sin dato" de uno con valor 0?

---

# Paso 7: `buildLegend` (leer el mapa)

Archivos: `src/core/legend.ts` + `legend.test.ts`, exportada desde `src/core/index.ts`.

## 7.1 Qué hace

```ts
buildLegend({ scale, values, formatValue?, emptyLabel? }) → LegendItem[]
// LegendItem = { color, label, from?, to?, count }
```

Convierte la escala del paso 5 en una lista de clases listas para pintar, **reutilizando sus `thresholds` y
`colors`** (no recalcula nada: leyenda y mapa no pueden desincronizarse) y **contando cuántas regiones caen
en cada clase**. Una leyenda es lo que da significado a los colores.

| Caso                           | Resultado                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Escala `classed`               | Un item por clase; `from`/`to` salen de los cortes y del dominio de la escala.      |
| Escala `continuous` (`linear`) | `[]`: no hay clases. Se dibujará como degradado usando `scale.domain` (capa React). |
| `emptyLabel` presente          | Se añade al final un item "sin dato" con `emptyFill` y el nº de `null`/`NaN`.       |

## 7.2 Decisiones

- **El conteo usa la misma regla que el mapa:** un valor justo en un corte va a la clase de arriba
  (búsqueda binaria sobre los cortes). Hay un test que verifica que, para cada clase, el nº de regiones que
  `scale.getColor` pinta de ese color coincide con `count`.
- **`classification` no es parámetro** (a diferencia de `dd.md §20`): ya está dentro de la escala
  (`thresholds`), pasarlo otra vez permitiría contradecirla.
- **El item "sin dato" es opcional** y se pide con `emptyLabel`, para que el texto (i18n) lo ponga quien usa la librería.
  El `0` no cuenta como sin dato.
- **Formato por defecto:** enteros tal cual, decimales con máximo 2. `formatValue` lo sustituye (p. ej. `v => `${v} %``).
- **Los límites se muestran como `from – to`** también en la última clase (`to` = máximo del dominio). En
  una escala `threshold` manual el primero y el último vienen del dominio de los datos, no son infinitos.

## 7.3 Tests

88 tests en total, `typecheck` y `oxlint` limpios; cobertura de `src/core` 100 % líneas, 97,5 % ramas.

## 7.4 Antes de pasar al paso 8: ¿lo tienes claro?

- ¿Por qué la leyenda recibe la escala y no vuelve a calcular cortes?
- ¿En qué clase cuenta un valor igual a un corte, y por qué debe coincidir con el mapa?
- ¿Por qué una escala continua devuelve `[]`?

---

# Paso 8: la capa React, nivel 3 (headless): `useChoropleth`

Archivos: `src/react/use-container-size.ts`, `src/react/use-choropleth.ts`, `src/core/borders.ts` (+ tests y
`tests/fixtures.ts`). La story provisional `first-map` pasa a ser `stories/headless.stories.tsx`.

## 8.1 Las tres APIs son UNA implementación

`dd.md §9` define tres niveles. La clave para que **coexistan** es que no son tres códigos, sino tres
envoltorios de lo mismo:

```
 core (funciones puras)
   └─► useChoropleth()            ← Nivel 3 (headless): devuelve DATOS. Este paso.
         └─► <Choropleth.Root>    ← Nivel 2 (compound): llama al hook y lo reparte por Context.
               │   <Choropleth.Regions/> <Borders/> <Legend/> <Tooltip/>  leen ese Context
               └─► <ChoroplethMap>  ← Nivel 1 (preset): Root + las piezas por defecto, ya montado.
```

| Nivel        | Estado       | Qué añade sobre el anterior                                                     |
| ------------ | ------------ | ------------------------------------------------------------------------------- |
| 3 · hook     | ✅ este paso | Todo el cálculo. No pinta nada.                                                 |
| 2 · compound | ⏳ paso 9    | Un `Context` + componentes que consumen `regions`, `borders`, `legend`.         |
| 1 · preset   | ⏳ paso 10   | Compone el compound con valores por defecto. `ChoroplethMap` = `Root` + piezas. |

Por eso se construye **de abajo arriba**: si el hook devuelve todo lo necesario, los otros dos son
trozos de JSX. Y por eso `dd.md` dice «un solo código interno».

## 8.2 `useContainerSize`

Mide un elemento con `ResizeObserver` y devuelve `{ ref, width, height }`. Es un `useEffect` legítimo (observar
el DOM es un efecto real) (observar el DOM es un efecto real; lo demás se deriva al renderizar).

- **Nunca devuelve 0.** Un contenedor oculto daría `width = 0` y `createProjection` lanza error. Se ignoran
  las medidas con ancho 0 y se conserva la anterior.
- **Tamaño inicial 960 × 500** hasta tener medida (primer render, SSR, jsdom sin `ResizeObserver`).
- **El alto se deriva del ancho** (`aspectRatio`, por defecto 960/500). Si usáramos el alto medido y el
  `<svg>` fijara la altura de su contenedor, al estrechar la ventana el alto nunca bajaría y el mapa
  perdería su proporción. `useContainerHeight: true` usa el alto real si el contenedor tiene altura propia.

## 8.3 `createBorders` (core)

Fronteras interiores como una sola línea, con `mesh(topology, object, (a, b) => a !== b)`. Una frontera
compartida se dibuja **una vez** (con un `stroke` por país se dibujaría dos veces y se solaparía), y `a !== b`
descarta las costas. Con **GeoJSON devuelve `null`**: sin topología no se sabe qué polígonos se tocan; ahí se
usa `stroke` en cada región. Test: con los dos cuadrados, solo sale el lado compartido.

## 8.4 `useChoropleth`: qué recibe y qué devuelve

```ts
const {
  containerRef,
  width,
  height,
  regions,
  borders,
  legend,
  scale,
  joinReport,
  hoveredId,
  selectedId,
  getRegionProps,
} = useChoropleth({
  geography,
  data,
  getId,
  getValue,
  variant: "diverging" /* projection, classification, palette… */,
});
```

| Devuelve         | Qué es                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `regions`        | `{ id, feature, path, fill, datum, value }[]`: lo que se pinta con `<path d fill>`.                     |
| `borders`        | `d` de las fronteras interiores, o `null` (GeoJSON).                                                    |
| `legend`         | `LegendItem[]` del paso 7, con conteos.                                                                 |
| `scale`          | La `ColorScale` completa (para leyendas continuas o lógica propia).                                     |
| `joinReport`     | `unmatchedData`, `featuresWithoutData`, `duplicateDataIds`. Alimentará el aviso del paso 11.            |
| `getRegionProps` | `data-region-id`, `data-selected`, `onClick`, `onMouseEnter`, `onMouseLeave` listos para `{...spread}`. |
| `hoveredId`      | Región bajo el ratón (estado del hook).                                                                 |

## 8.5 Por qué el orden interno es ese

| #   | Paso                       | Por qué va aquí                                                       | Qué pasaría si se invierte                                                    |
| --- | -------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Tamaño                     | Las rutas necesitan `width`/`height`.                                 | `createProjection` sin tamaño válido lanza error.                             |
| 2   | Geometría (`useMemo`)      | Depende solo de `geography`.                                          | —                                                                             |
| 3   | Rutas (`useMemo`)          | Geometría + proyección + tamaño. **Sin datos.**                       | Si dependieran de los datos, cambiar de indicador recalcularía todos los `d`. |
| 4   | Join → un valor por región | La escala necesita valores ya cruzados.                               | —                                                                             |
| 5   | Escala → `fill` → leyenda  | La leyenda reutiliza los cortes de la escala; el `fill` sale de ella. | Leyenda y mapa podrían discrepar.                                             |
| 6   | Handlers                   | Necesitan las regiones ya construidas.                                | —                                                                             |

## 8.6 Decisiones con impacto real

- **Los valores de la escala son uno por región, no uno por fila de `data`.** Un dato huérfano (`"ES"` cuando
  la geometría usa `"724"`) no entra en la escala: con una fila `{ ZZ: 1000 }` sin región, el máximo seguiría
  siendo el de las regiones reales. Además la leyenda cuenta regiones, no filas. Hay test.
- **Solo se memoizan las rutas y la geometría.** El join y la escala cuestan O(regiones) y se recalculan en cada
  render: memoizarlos exigiría que el consumidor estabilizara `getId`, `getValue` y `classification`
  (funciones y objetos inline cambian de identidad en cada render), y casi nadie lo hace. Test: cambiar
  `data` conserva rutas y `borders` y cambia los `fill`; cambiar el tamaño sí recalcula rutas.
- **`geography` debe tener referencia estable** (constante de módulo o `useMemo`): es la clave de la memoización.
  Esto va a la documentación pública.
- **Las regiones sin `id` o sin ruta no se devuelven** (p. ej. Kosovo en `world-atlas` no tiene id): no se pueden
  cruzar ni seleccionar. Se pierden visualmente; si molesta, se decide cómo pintarlas.
- **Hover = estado dentro del hook (`hoveredId`)**, no la posición del ratón. La posición del tooltip la
  gestionará el componente `Tooltip` del paso 9 para no re-renderizar todas las regiones en cada `mousemove`.
- **`selectedId` es controlado** (lo da el consumidor), como en `dd.md §9.2`.
- **Fuera de este paso:** `geography` como función de carga diferida, `projection` como instancia, `palette: string[]`,
  accesibilidad (teclado/`aria`), zoom. Siguen pendientes según el roadmap.

## 8.7 La story

`stories/headless.stories.tsx` (**Headless → useChoropleth**) pinta el mapa del mundo **solo con el hook**: regiones,
fronteras, borde de hover/selección (clic para seleccionar), y una leyenda HTML con conteos y el item «Sin dato».
Sustituye a la story provisional (que montaba todo a mano) y se conserva como ejemplo del nivel 3.

## 8.8 Tests

113 tests en total; `typecheck` y `oxlint` limpios; `build` y `build-storybook` compilan; cobertura de `src/core`
100 % líneas / 97,7 % ramas. Los de React usan `renderHook` y un `ResizeObserver` simulado. **No se ha mirado
la story en un navegador**: lo comprobado es que compila y que los datos del hook son correctos.

## 8.9 Antes de pasar al paso 9: ¿lo tienes claro?

- ¿Por qué el hook devuelve datos (`regions`) y no elementos (`<path>`)? ¿Qué nivel de API lo necesita así?
- ¿Por qué las rutas no dependen de los datos, y qué criterio de `dd.md` garantiza eso?
- ¿Por qué el alto se deriva del ancho en vez de medirse?
- ¿Por qué un dato huérfano no debe influir en la escala?
- ¿Por qué `borders` es `null` con GeoJSON?

---

# Paso 9: nivel 2 (compound): `Choropleth.Root` y sus piezas

Archivos: `src/react/components/{root,svg,regions,borders,selection,legend,tooltip}.tsx`,
`choropleth-context.ts`, `pointer-store.ts`, `choropleth.ts` (+ `choropleth.test.tsx`) y
`stories/compound.stories.tsx`. Ajuste menor al hook: ahora devuelve también `formatValue` y `clickable`.

## 9.1 Idea: un Context con el resultado del hook

```tsx
<Choropleth.Root geography data getId getValue variant>
  {" "}
  {/* llama a useChoropleth UNA vez */}
  <Choropleth.Svg /> {/* <svg>: Regions + Borders + Selection por defecto */}
  <Choropleth.Legend title="…" /> {/* HTML */}
  <Choropleth.Tooltip /> {/* HTML */}
</Choropleth.Root>
```

`Root` ejecuta `useChoropleth`, mete el resultado en un `Context` y renderiza un `<div>` (el contenedor medido).
Cada pieza lee del Context lo que necesita. **Ninguna recibe `data`, `scale` ni `regions` por props**: por eso se
pueden quitar, reordenar o sustituir sin romper nada. El preset del paso 10 será solo esto con las piezas puestas.

| Pieza       | Dónde vive | Qué hace                                                                                            |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `Root`      | HTML       | Hook + Context + contenedor `position: relative` + seguimiento del cursor.                          |
| `Svg`       | `<svg>`    | El lienzo. Sin hijos pinta `Regions`, `Borders`, `Selection`.                                       |
| `Regions`   | SVG        | Un `<path>` por región con su `fill`. Eventos delegados.                                            |
| `Borders`   | SVG        | Fronteras interiores (una ruta). No se pinta con GeoJSON.                                           |
| `Selection` | SVG        | Resalta hover y seleccionada, **encima** de las fronteras.                                          |
| `Legend`    | HTML       | Swatches con rangos, o barra de degradado si la escala es `linear`. Render prop = leyenda headless. |
| `Tooltip`   | HTML       | Junto al cursor. Por defecto nombre + valor; render prop con contexto tipado.                       |

## 9.2 Decisiones con impacto real

- **`Svg` es una pieza nueva respecto a `dd.md §9.3`.** El ejemplo del documento pone `Regions` y `Legend` como
  hermanas dentro de `Root`, pero un `<path>` solo existe dentro de un `<svg>` y un `<div>` de leyenda no puede
  vivir dentro de uno. Alguien tiene que ser el `<svg>`. `Svg` sin hijos reproduce el comportamiento esperado.
- **Eventos delegados** (`dd.md §14`): un `onClick`/`onMouseOver` en el `<g>` de `Regions` que busca el
  `data-region-id` con `closest()`, en vez de un listener por país. Con ello cada `<path>` es un `memo` cuyas
  props son solo primitivos (`id`, `d`, `fill`, `stroke`): **mover el ratón no re-renderiza los 177 paths**.
- **Hover y selección se pintan en `Selection`, no en cada región.** Si el borde de resaltado fuera del propio
  `<path>`, los vecinos (pintados después) lo taparían a medias. Una capa superior con `pointer-events: none`
  lo resuelve y además evita que el resalte invalide el `memo`. Si coinciden hover y selección, se ven ambos
  trazos, con el azul de selección encima.
- **La posición del cursor no es estado de React.** Un `useState` en `Root` re-renderizaría todo en cada
  `mousemove`. Vive en un mini-store (`pointer-store.ts`) al que solo se suscribe el tooltip con
  `useSyncExternalStore`: tampoco hace falta `useEffect` para registrar listeners.
- **Tooltip sin medir su tamaño:** se voltea (`translate(-100%)`) cuando el cursor está en la mitad derecha o
  inferior. Es aproximado, pero no mide el DOM ni usa efectos. Si hace falta precisión, `@floating-ui/react` (`dd.md §6`).
- **Theming con CSS variables inline con valor por defecto**: `stroke="var(--cm-border-color, #ffffff)"`,
  `--cm-border-width`, `--cm-hover-stroke`, `--cm-selected-stroke`, `--cm-transition-duration`. Sobrescribibles
  desde el consumidor y **sin archivo CSS** que importar (por eso aún no hay prop `unstyled`).
- **Con GeoJSON no hay `borders`**: `Regions` pinta entonces el contorno de cada región. Hay test de ambos casos.
- **Los genéricos no llegan al Context** (un Context no puede ser genérico): `useChoroplethContext<TDatum>()` es
  una aserción de tipo. En JSX el tipo se indica así: `<Choropleth.Tooltip<Row>>{({ datum }) => …}</…>`.
- **Una pieza fuera de `Root` lanza un error claro** en vez de un `Cannot read properties of null`.

## 9.3 Qué NO hace todavía

Accesibilidad por teclado (el tooltip al enfocar, `dd.md §12.2`), `defaultSelectedId` (selección no controlada),
`dimUnselected`, `position` de la leyenda (hoy se coloca con CSS desde fuera, como en la story), tooltip con
`@floating-ui`, regiones sin dato con trama (_hatch_), `unstyled`. Cada uno es una mejora acotada para después.

## 9.4 La story

`pnpm storybook` → **Compound → Choropleth.Root**: `Default`, `CustomTooltip` (render prop) y `Sequential`.
Clic para seleccionar; la leyenda se coloca con un `<div>` absoluto fuera del `<svg>`.

## 9.5 Tests

138 tests, `typecheck` y `oxlint` limpios; `build` y `build-storybook` compilan; cobertura de `src/core` 100 %
líneas. Los de compound usan Testing Library: render por defecto, composición parcial, clic, hover (incluido
el océano y el cambio de región), `Selection`, las cuatro variantes de leyenda, posición y volteo del tooltip, y el
error fuera de `Root`. **No se ha visto la story en un navegador** (se cerró el IDE durante la sesión y no se
reabrió): compila y los tests pasan, pero conviene mirarla.

## 9.6 Antes de pasar al paso 10: ¿lo tienes claro?

- ¿Por qué `Svg` existe como pieza si `dd.md` no la nombra?
- ¿Por qué se delega el evento en el `<g>` y qué evita en cuanto a renders?
- ¿Por qué hover y selección se dibujan en una capa aparte y encima de `Borders`?
- ¿Por qué la posición del cursor no es un `useState`?
- ¿Cómo permite el Context quitar la leyenda o cambiar el orden de las piezas sin tocar nada más?

---

# Paso 10: nivel 1 (preset): `<ChoroplethMap>`

Archivos: `src/react/choropleth-map.tsx` (+ test) y `stories/choropleth-map.stories.tsx`.
Con este paso **las tres APIs de `dd.md §9` coexisten**.

## 10.1 Es solo composición

```tsx
<ChoroplethMap
  geography={world} data={markets}
  getId={(m) => m.isoCode} getValue={(m) => m.variation}
  variant="diverging"
  legend={{ title: "Var. % vs A-1", position: "bottom-left" }}
  renderTooltip={({ datum, formattedValue }) => <MarketTooltip … />}
  selectedId={id} onRegionClick={({ id }) => setId(id)}
/>
```

Por dentro no hay lógica: `Root` + `Svg` + `Legend` (en una esquina) + `Tooltip`. Todo el cálculo está en el hook
(paso 8) y todo el dibujo en las piezas (paso 9). Resultado: un solo código interno para tres niveles de control.

| Si necesitas…                                 | Usas                                           |
| --------------------------------------------- | ---------------------------------------------- |
| Un mapa ya                                    | `<ChoroplethMap>`                              |
| Quitar/reordenar piezas o leyenda propia      | `<Choropleth.Root>` + piezas (copia el preset) |
| Pintar tú todo (otra librería de UI, canvas…) | `useChoropleth()`                              |

## 10.2 Props y decisiones

- **Props = las del hook + `legend`, `renderTooltip`, `className`, `style`, `ariaLabel`.** La unión discriminada
  por `variant` viene del hook, así que el preset no la redefine: una sola fuente de verdad.
- **Errores de compilación comprobados** (con `@ts-expect-error`, que falla si el código llegara a compilar):
  falta `getValue`, `palette="rdbu"` con `sequential`, `midpoint` con `sequential`, falta `variant`.
- **`TDatum` se infiere** de `data` y `getId`: `renderTooltip` y `onRegionClick` reciben `datum` con el tipo real.
- **`legend`**: `false` la oculta; `{ title, position, showCount }` la configura. Posiciones: las cuatro esquinas,
  por defecto `bottom-left`. Es un `div` absoluto sobre el mapa; si hace falta otra cosa, usar el compound.
- **«Sin dato» aparece en la leyenda por defecto** (`emptyLabel`), porque es el aviso visual de que el gris no es
  un cero. Se cambia con `emptyLabel="…"`. (Texto en español fijo: la i18n está sin resolver.)
- **Tooltip por defecto siempre activo.** No hay `tooltip={false}` todavía.

## 10.3 Lo que sigue sin existir (`dd.md §9.1` lo promete)

| Falta                                                              | Nota                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `geography` como `() => import("…")`                               | Carga diferida. Pide estado asíncrono (`useEffect` + `import()`, o Suspense/`use`).  |
| Geodatos propios (`geo/world-110m`) y tabla ISO numérico → alpha-2 | Hoy la story usa `world-atlas` y ids numéricos (`"724"`). Es la tarea de `src/geo/`. |
| Zoom/pan, regiones sin dato con trama, teclado                     | Fuera de v0.1 (zoom) o pendientes de accesibilidad.                                  |
| `projection` como instancia, `palette: string[]`                   | Recortados en pasos anteriores.                                                      |
| Aviso en consola de ids sin cruzar                                 | Tarea 11 (siguiente).                                                                |

## 10.4 Tests

147 tests, `typecheck` y `oxlint` limpios; `build` y `build-storybook` compilan; cobertura de `src/core` 100 %
líneas. Cubren: props mínimas, `diverging` con `midpoint`, leyenda (oculta / título / esquina / conteos),
`emptyLabel`, `renderTooltip` con datum tipado, `onRegionClick`, `selectedId`, `className`/`style`/`ariaLabel` y los
errores de tipos. **Sigo sin haber visto las stories en un navegador**: conviene abrir `pnpm storybook` →
**Preset → ChoroplethMap**.

## 10.5 Antes de pasar al paso 11: ¿lo tienes claro?

- ¿Por qué el preset no tiene lógica propia y qué ventaja da eso?
- ¿Qué parte de los tipos del preset viene del hook y por qué no se redefine?
- ¿Por qué «Sin dato» sale en la leyenda por defecto?
- ¿Cuándo usarías el compound en lugar del preset, y cuándo el hook?

---

# Paso 11: diagnóstico en desarrollo

Archivos: `src/core/diagnostics.ts` (+ test) y cambios en `use-choropleth.ts`.

## 11.1 El problema

Un mapa con ids que no cruzan sale **gris sin ningún error**. `joinData` ya detectaba el problema (paso 4) y el
hook exponía `joinReport` (paso 8), pero nadie se lo decía al desarrollador. Ahora sí:

```
[choropleth] 3 datum(s) have no matching geometry: "ES", "FR", "IT".
             Hint: your data ids look like ISO 3166-1 alpha-2 (e.g. "ES") but the geometry ids look like
             ISO 3166-1 numeric (e.g. "724"). Convert one of them, or use `getFeatureId`…
             41 region(s) have no data and will use `emptyFill`.
```

## 11.2 Dos piezas separadas, a propósito

| Pieza                     | Dónde | Qué hace                                                                            |
| ------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `formatJoinDiagnostics`   | core  | **Pura**: informe → texto (o `null` si no hay nada que avisar). No toca la consola. |
| Efecto en `useChoropleth` | react | Decide **cuándo** avisar, escribe en consola y llama a `onJoinReport`.              |

Mismo criterio que en el paso 4: separar «calcular» de «mostrar» permite testear los textos sin simular la
consola ni `process.env`.

## 11.3 Las pistas: solo cuando son claras

Una pista equivocada es peor que ninguna, así que solo se da en tres casos concretos:

1. **Ceros a la izquierda:** dato `"4"` y la geometría tiene `"004"` (Excel/CSV los pierde).
2. **Mayúsculas:** dato `"es"` y la geometría tiene `"ES"`.
3. **Sistema de ids distinto:** _todos_ los ids huérfanos son de un estilo (numérico / alpha-2 / alpha-3) y _todos_
   los de las regiones sin dato son de otro. Si están mezclados o no son reconocibles, no hay pista.

Para comparar estilos se usan las regiones sin dato como muestra del estilo de la geometría.

## 11.4 Decisiones

- **Es un `useEffect`, y es lo correcto.** Escribir en consola y llamar a un callback externo es un efecto secundario
  real: hacerlo durante el render lo ejecutaría varias veces (React puede repetir renders; el hover renderiza en cada
  movimiento). (`dd.md §20` ya no limita el uso de `useEffect`: se usa cuando hace falta un efecto de verdad.)
- **«Una vez por cambio de datos»:** el efecto depende de una _clave_ construida con el resultado del cruce
  (ids huérfanos, regiones sin dato, duplicados, nº de filas), no de `data` ni de funciones. Cambiar solo los
  valores, pasar el ratón o redefinir `onJoinReport` inline **no** avisa de nuevo. Hay un test para cada caso.
  Consecuencia asumida: `onJoinReport` se lee del render que provocó el cambio, no se re-suscribe.
- **Con 0 filas no se avisa:** es lo normal mientras cargan los datos; avisar «todas las regiones sin dato» sería ruido.
- **Solo fuera de producción** (`NODE_ENV !== "production"`, protegido con `typeof process` por si no hay bundler).
  **`onJoinReport` sí se llama en producción**: es para UI o telemetría, no para el desarrollador.
- **`diagnostics={false}`** silencia la consola (no el callback).
- **Mensajes en inglés**, como en `dd.md §9.6`: son para quien programa. Los textos de interfaz («Sin dato») son otro tema.
- **`tests/setup.ts` silencia `console.warn` en todos los tests** (los datos de prueba tienen huérfanos a propósito);
  los tests de diagnóstico lo vuelven a espiar. En el Storybook el aviso sí saldrá en la consola del navegador.
- Un id huérfano de verdad (típico: Kosovo) **sigue avisando**: no hay lista de exclusiones.

## 11.5 Tests

170 tests. `diagnostics.test.ts` (12) cubre cada línea y cada pista, y los casos sin pista; los del hook comprueban
una sola llamada, no repetición con hover ni con cambio de valores, repetición al cambiar el cruce, silencio
(sin datos / todo cruza / `diagnostics={false}` / producción) y cuándo se llama a `onJoinReport`.

---

# Paso 12: CSS y theming

Archivos: `src/react/styles.css`, `tsup.config.ts`, `package.json` (`exports`), `.storybook/preview.ts` y las clases
de cada componente.

## 12.1 Qué cambia

Hasta el paso 10 los estilos eran _inline_ con `var(--cm-…, respaldo)`. Funcionaba, pero sin clases no se puede
tematizar con CSS normal, no hay `unstyled` y todo el mundo carga estilos que no puede quitar. Ahora:

| Mecanismo              | Cómo se usa                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Variables `--cm-*`** | `.cm-root { --cm-border-color: … }` o en cualquier ancestro. Es el 90 % de la personalización.             |
| **Clases `cm-*`**      | Cada pieza tiene la suya (`cm-region`, `cm-borders`, `cm-legend__item`, `cm-tooltip`…) para ajustes finos. |
| **`className`**        | En `Root`, `Legend`, `Tooltip`, `Svg` y `ChoroplethMap`.                                                   |
| **`unstyled`**         | Quita **todas** las reglas de `styles.css` salvo las variables. Para quien aporta su propio CSS.           |

Variables disponibles (`dd.md §9.7` más algunas): `--cm-empty-fill`, `--cm-border-color`, `--cm-border-width`,
`--cm-hover-stroke(-width)`, `--cm-selected-stroke(-width)`, `--cm-transition-duration`, `--cm-font-family`,
`--cm-font-size`, `--cm-tooltip-bg/-color/-border`.

## 12.2 Cómo se carga: import explícito

```ts
import "choropleth-kit/styles.css";
```

`tsup` compila `styles.css` como una entrada más (`dist/styles.css`) y `exports` la publica. **No se importa desde el
JS de la librería**: eso obligaría a todo consumidor a tener un bundler configurado para CSS, y un import
automático no se puede quitar. `sideEffects: ["**/*.css"]` (paso 1) evita que el bundler descarte el CSS importado.
Storybook lo importa en `.storybook/preview.ts`.

**Riesgo conocido:** si el consumidor olvida el import, el mapa se ve pero sin fronteras, sin resaltado y con el
tooltip sin caja — y no hay error. Se documentará en el README. (Lo que _no_ depende del CSS: el color de cada
región y la posición del tooltip.) Existe `dist/styles.d.ts` con `export {}`: lo genera tsup, es inofensivo.

## 12.3 Qué va en el CSS y qué sigue en línea

- **En el CSS (visual):** trazos, anchos, fuentes, caja del tooltip, leyenda, transición de color.
- **En línea (funcional):** el `fill` de cada región, el fondo de cada swatch y del degradado, la posición del
  tooltip, `position: relative` del contenedor y `cursor: pointer`. Dependen de datos o del cursor.
- **Trampa evitada:** el CSS **no define `fill`** en `.cm-region`; una regla CSS ganaría al color del dato.
  Por eso el `fill` de la región pasó de atributo a `style={{ fill }}` (también porque puede valer `var(…)`).

## 12.4 Detalles con impacto real

- **«Sin dato» ahora es tematizable:** el `emptyFill` por defecto es `var(--cm-empty-fill, #d4d4d4)`. Un `emptyFill`
  pasado por props sigue teniendo prioridad. El respaldo hace que sin `styles.css` siga siendo gris.
- **Con GeoJSON** (sin capa de fronteras) las regiones llevan `data-outlined` en su `<g>` y el CSS les dibuja el
  contorno; con TopoJSON lo hace `.cm-borders`, una vez por frontera.
- **`prefers-reduced-motion`:** el CSS pone `--cm-transition-duration: 0ms`, sin código JS. Es la mitad CSS de la
  prop `animate` de `dd.md §9.2` (que sigue sin existir).
- **El tooltip por defecto lleva la clase `cm-tooltip--default`; el personalizado, no.** Si pasas tu contenido,
  la caja es tuya (antes ya era así, ahora se puede sobrescribir por clase).
- **Hay una story `Themed`** (Preset → ChoroplethMap) que cambia 8 variables desde un `div` padre.

## 12.5 Tests y comprobaciones

170 tests; `typecheck`, `oxlint` y `prettier` limpios; `build` genera `dist/styles.css` (2,3 KB) y `build-storybook`
compila. Los tests nuevos cubren la variable de «sin dato», la prioridad de `emptyFill`, `unstyled` (en `Root` y en el
preset) y la clase del tooltip. **Lo que NO puede comprobar jsdom: que las reglas CSS se apliquen de verdad** (jsdom
no resuelve el CSS importado). Eso exige abrir Storybook; sigo sin haberlo visto en un navegador.

## 12.6 Antes de pasar al siguiente paso: ¿lo tienes claro?

- ¿Por qué el aviso de consola va en un `useEffect` y no en el render? ¿Qué lo hace «una vez por cambio»?
- ¿Por qué una pista de diagnóstico se da solo cuando es clara?
- ¿Por qué `styles.css` no se importa solo desde el JS de la librería?
- ¿Por qué el CSS no puede definir `fill` en las regiones?
- ¿Qué diferencia hay entre sobrescribir una variable `--cm-*` y usar `unstyled`?

---

# Paso 13: presets por `variant` (`categorical` y `bubble`)

Archivos: `src/core/{variants,categories,bubbles}.ts`, `src/react/components/bubbles.tsx`, cambios en el hook,
`Legend`, `Tooltip`, `Svg` y `styles.css`; `stories/variants.stories.tsx`. Implementa `dd.md §10`.

## 13.1 La idea de `dd.md §10`: un variant es una función pura

Hasta ahora el hook tenía la lógica de «secuencial/divergente» escrita dentro. Ahora cada variant es una rama de
**`resolveVariant`** (en `core`, sin React): recibe las regiones ya cruzadas con sus datos y devuelve **cómo se pintan**.

```
resolveVariant({ config, entries, data, centroids, project, … })
   → { fills, values, labels, scale, legend, bubbles, sizeLegend }
```

| Variant       | Escala                            | Regiones              | Leyenda                                      | Burbujas |
| ------------- | --------------------------------- | --------------------- | -------------------------------------------- | -------- |
| `sequential`  | quantile/quantize/… (paso 5)      | Coloreadas            | Swatches con rangos                          | —        |
| `diverging`   | simétrica alrededor de `midpoint` | Coloreadas            | Swatches con rangos                          | —        |
| `categorical` | ordinal (paleta categórica)       | Coloreadas            | Una entrada por categoría                    | —        |
| `bubble`      | **raíz cuadrada** (radio)         | Neutras (`emptyFill`) | Círculos de tamaño (+ swatches si hay color) | Sí       |

Añadir un variant nuevo = una rama en `resolveVariant` + un caso en `VariantConfig`. El hook, `Root`, el preset y
las piezas no cambian (salvo que el variant traiga una capa nueva, como `Bubbles`). Es lo que hace que cambiar
`variant` en caliente **no recalcule rutas**: solo se vuelve a ejecutar esta función, y las rutas siguen en su `useMemo`.

## 13.2 `categorical`

```tsx
<ChoroplethMap
  variant="categorical"
  getCategory={(r) => r.zone}
  categories={[
    { id: "N", label: "Norte" },
    { id: "S", color: "#e11d48" },
  ]}
  palette="tableau10"
/>
```

- **Sin `categories`, el orden es alfabético, no el de aparición.** Si dependiera del orden de los datos, recargar
  con las filas en otro orden cambiaría el color de cada categoría. Para colores estables entre pantallas hay que pasar `categories`.
- **Más categorías que colores → los colores se repiten** (como hace d3) y dos categorías serían indistinguibles.
  Hay 7 paletas (`tableau10` por defecto, `set2`, `set3`, `accent`, `dark2`, `paired`, `pastel1`); en `categories` cada una puede llevar su `color`.
- **Categoría desconocida o `null` → `emptyFill`.** Y se cuenta como «sin dato» en la leyenda.
- `Region.value` pasa a ser `number | string | null` (en `categorical` es la categoría) y la región trae **`formattedValue`**
  ya listo («Insignia»): el tooltip deja de formatear por su cuenta, porque ya no todo valor es un número.
- `scale` es `null`: no hay escala numérica.

## 13.3 `bubble`

Valores **absolutos** → círculos (la regla de oro de `dd.md §3.1`: no pintar absolutos con relleno).

- **Radio con raíz cuadrada** (`dd.md §3.2`): el doble de valor ⇒ el doble de **área** (radio ×1,41). Hay un test que lo mide.
- **El dominio empieza en 0**, no en el mínimo: con `[min, max]` el valor más pequeño tendría radio 0 y desaparecería, y las
  razones entre áreas serían falsas.
- **Los `null`, 0 y negativos no dibujan círculo.** Un área no puede ser negativa.
- **Se dibujan de mayor a menor** para que las pequeñas queden encima.
- **Posición:** por defecto, el **centroide de la región** (`geoPath.centroid`, ya proyectado y solo calculado para `bubble`).
  Con `getCoordinates={(d) => [lon, lat]}` se posiciona con la proyección y **no pasa por las regiones** (tiendas, ciudades).
- **Bivariante:** `getColorValue` colorea con la escala divergente (misma `classification`/`palette`/`midpoint` del diverging).
  Sin él, color único (`color` o `--cm-bubble-fill`).
- **Leyenda de tamaño:** tres círculos de referencia (¼, ½ y máximo) en `Legend` (`sizeItems` en la render prop) y `sizeLegend` en el hook.
- **Con `getCoordinates` no se avisa de ids sin cruzar** (paso 11): una tienda no tiene por qué corresponder a un país.
- **Regiones neutras en `emptyFill`**: el color lo ponen las burbujas; colorear también la región competiría con ellas.
  (Efecto secundario a decidir: en `bubble` «sin dato» y «región neutra» comparten color.)

## 13.4 Lo que NO hace todavía (decisiones abiertas)

| Pendiente                                                        | Por qué importa                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Burbujas con `getCoordinates` no son interactivas**            | `pointer-events: none`. Hover/clic/tooltip de una tienda exige un evento que no sea `RegionEvent` (una tienda no es una región). Es parte del diseño de `§12`. |
| Centroide de países con territorios lejanos                      | Francia o EE. UU. caen donde el área media, no en la metrópoli. Se resolverá con `getCoordinates` o un «punto de anclaje».                                     |
| Aviso «variant sequential con valores que suman un total»        | `dd.md §9.6`/`§3.1`: detectar absolutos pintados con relleno. Aún no.                                                                                          |
| `ckmeans`, leyenda de degradado con ticks, hatch para «sin dato» | Siguen fuera.                                                                                                                                                  |
| Transición de `r` al cambiar de indicador                        | Está en el CSS (`transition: r`), sin verificar en navegador.                                                                                                  |

## 13.5 Tests

202 tests; `typecheck`, `oxlint` y `prettier` limpios; `build` y `build-storybook` compilan; cobertura de `src/core` 100 % líneas.
`categories`/`bubbles`/`variants` tienen tests propios (orden alfabético, ciclado de paleta, área ∝ valor, dominio desde 0, orden
de dibujo, bivariante, coordenadas propias, centroide `null`). En React: hook, compound y preset con ambos variants, y
errores de compilación nuevos (`categorical` sin `getCategory`, `getCoordinates` en `sequential`). **No he visto las
stories en un navegador** (`Variants → ChoroplethMap`: `Categorical`, `BubbleOnCountries`, `BubbleBivariate`, `BubbleStores`).

## 13.6 Antes de seguir: ¿lo tienes claro?

- ¿Por qué `resolveVariant` es una función pura de `core` y no parte del hook?
- ¿Por qué el radio usa raíz cuadrada y el dominio arranca en 0?
- ¿Por qué las categorías automáticas se ordenan alfabéticamente?
- ¿Por qué una burbuja con `getCoordinates` no genera aviso de «sin cruzar» y una con centroide sí?
- ¿Por qué las burbujas con coordenadas propias no pueden usar `RegionEvent` para hover/clic?

---

# Revisión de Opus 5.5 tras el paso 13

> **Para el agente que retome el trabajo:** esta sección es de lectura obligatoria. Responde a las tres
> preguntas que dejaba abiertas el paso 13 (evento unificado, dónde vive el zoom, qué es un nivel),
> corrige varias decisiones y fija el orden de los pasos 14 en adelante. El diseño completo está en
> `dd.md §11` (zoom, pan, drill-down), `§12` (interacción, estilado, animaciones) y `§21` (handoff).

## R.1 Valoración general

El trabajo es **sólido y por encima de lo habitual** para una v0.1: comprobado con `pnpm typecheck`,
`pnpm lint` y `pnpm test` (202 tests en verde).

| Aspecto                                  | Valoración | Comentario                                                                                                                  |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Separación `core` / `react`              | Excelente  | `core` puro, testeable, con funciones pequeñas y nombres claros. Es la base que permite todo lo que viene.                  |
| Tres niveles de API, un solo código      | Excelente  | El preset es composición pura; el compound comparte un Context; el hook es el motor.                                        |
| Tipos                                    | Muy bien   | Uniones discriminadas por `variant`, paletas tipadas por variant, `@ts-expect-error` como test de API.                      |
| Memoización de rutas                     | Muy bien   | Las rutas no dependen de datos; GeoJSON devuelto por referencia. Criterio clave cumplido.                                   |
| Eventos delegados, `memo`, pointer-store | Muy bien   | Buen instinto de rendimiento. El patrón del pointer-store es justo el que hay que generalizar.                              |
| Diagnóstico                              | Excelente  | Pistas solo cuando son claras, efecto con clave de resultado. Diferencial real de DX.                                       |
| Cartografía                              | Muy bien   | `sqrt` + dominio desde 0, simetría divergente, `SEQUENTIAL_START`, categorías alfabéticas, «sin dato» ≠ 0.                  |
| Documentación (este diario)              | Excelente  | Didáctica, con el «por qué» y el «qué pasaría si». Mantener el formato.                                                     |
| **Verificación visual**                  | **Débil**  | Ninguna story se ha visto en un navegador (pasos 8-13). Para lo que viene (zoom, animaciones) **no es aceptable**: ver R.4. |

## R.2 Problemas encontrados (a corregir en la fase A)

| #   | Severidad | Dónde                                                  | Problema                                                                                                                                                                                                                             | Corrección (paso)                                                                  |
| --- | --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | **Alta**  | `use-choropleth.ts`                                    | `hoveredId` es `useState` del hook: **cada cambio de región re-renderiza `Root`** y recalcula join, escala, leyenda y burbujas. Con zoom, drill y miles de regiones esto produce tirones. El `memo` de `RegionPath` lo disimula hoy. | `map-store` (15)                                                                   |
| 2   | **Alta**  | `use-choropleth.ts`, `regions.tsx`                     | Regiones sin id **no se pintan**: en `world-atlas` quedan **agujeros** (Kosovo, Chipre del Norte, Somalilandia). Visible en cualquier demo de Europa.                                                                                | Capa no interactiva en `emptyFill` (19)                                            |
| 3   | **Alta**  | `variants.ts` (centroides)                             | `geoPath.centroid` con territorios lejanos: la burbuja de **Francia cae en el Atlántico**, la de EE. UU. desplazada. El mismo cálculo romperá el «zoom a región».                                                                    | `getFocusGeometry` + `polylabel` (20)                                              |
| 4   | **Alta**  | `package.json`                                         | La API pública expone tipos de `geojson` y `topojson-specification` (`Feature`, `Topology`), pero `@types/geojson` y `@types/topojson-specification` están en `devDependencies`: un consumidor con TS verá `any` o errores.          | Pasarlos a `dependencies` (14). Ya lo anticipaba el paso 2.2.                      |
| 5   | Media     | `regions.tsx`, `root.tsx`, `bubbles.tsx`               | Solo eventos de ratón; burbujas con coordenadas no interactivas; `RegionEvent` no sirve para puntos.                                                                                                                                 | `MapItem` + Pointer Events (16)                                                    |
| 6   | Media     | `tooltip.tsx`, `choropleth-map.tsx`                    | Textos de UI en español fijos («Sin dato»). Para una librería pensada para OS, el idioma no puede ser fijo.                                                                                                                          | `labels` (18)                                                                      |
| 7   | Media     | `styles.css`                                           | `vector-effect: non-scaling-stroke` solo en la selección; las fronteras engordarán al hacer zoom.                                                                                                                                    | (19)                                                                               |
| 8   | Media     | `use-container-size.ts`                                | Proporción fija 960/500 aunque la geometría sea Chile o Noruega.                                                                                                                                                                     | `aspectRatio: "auto"` (19)                                                         |
| 9   | Media     | `svg.tsx`                                              | `role="img"` oculta los hijos a lectores de pantalla: incompatible con un mapa navegable por teclado.                                                                                                                                | Decisión en a11y (`dd.md §13.4`); de momento no añadir más interacción bajo `img`. |
| 10  | Media     | `tooltip.tsx`                                          | Volteo por mitades del mapa: con tooltips anchos se sale del contenedor (criterio de §20 no cumplido del todo).                                                                                                                      | `placeTooltip` puro + medición (fase D o antes si molesta)                         |
| 11  | Baja      | `src/core/placeholder.ts`, `src/react/placeholder.tsx` | Código provisional **exportado en la API pública** (`describeLibrary`, `Placeholder`).                                                                                                                                               | Borrar (14)                                                                        |
| 12  | Baja      | `styles.css` (burbujas)                                | `transition: r` no es fiable en todos los navegadores (Safari).                                                                                                                                                                      | FLIP con WAAPI (fase D, `dd.md §12.4.4` #8)                                        |
| 13  | Baja      | `projection.ts`                                        | Solo proyecciones por nombre; el drill necesita fábricas y `fitExtent` a una geometría de foco.                                                                                                                                      | `rebaseProjection` (fase C)                                                        |

## R.3 Correcciones a afirmaciones de este diario

| Dónde          | Decía                                                           | Ahora                                                                                                                    |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cabecera       | `../dd.md`                                                      | `coropleth-library.md`, alias `dd.md` (corregido).                                                                       |
| 1.7 / 1.4      | Git sin inicializar                                             | Ya es repositorio con remoto (corregido).                                                                                |
| 2.4            | `d3-zoom`, `d3-transition`, `d3-interpolate` «son de v0.2»      | Son de la fase B (v0.3). Se añaden además `d3-selection` y `d3-ease`; **ninguna librería de animación** (`dd.md §12.6`). |
| 8.6            | Regiones sin id: «si molesta, se decide»                        | Decidido: se pintan como capa no interactiva (R.2 #2).                                                                   |
| 8.6 / 9.2      | Hover como estado del hook / `Root`                             | Se mueve al `map-store` (R.2 #1). El razonamiento del pointer-store era correcto: se generaliza.                         |
| 11.4           | «`dd.md §20` ya no limita el uso de `useEffect`»                | Ahora es verdad: `dd.md §20` y `§21` lo dicen explícitamente (efectos reales sí; derivar estado no).                     |
| 12.4           | `prefers-reduced-motion` es «la mitad CSS de la prop `animate`» | La prop se llama `animation` (`boolean \| AnimationOptions`) y tiene tokens de movimiento (`dd.md §12.4`).               |
| 13.4           | «Transición de `r` … sin verificar»                             | Se sustituye por FLIP (R.2 #12).                                                                                         |
| Siguiente paso | Tres preguntas abiertas                                         | Respondidas abajo (R.5).                                                                                                 |

## R.4 Reglas nuevas de trabajo

1. **Verificación visual obligatoria**: desde el paso 14, ningún paso con efecto visible se marca ✅
   sin haber abierto su story en un navegador. Si el agente no puede, lo escribe en el paso y el humano
   lo revisa antes de seguir.
2. **Contador de renders** en los tests de interacción: es la forma de demostrar las reglas de
   rendimiento («mover el ratón no re-renderiza `Root`», «el zoom no re-renderiza nada»).
3. **Lo puro, a `core`** con tests antes que el componente (cámara, límites, foco, rebase, máquina del
   drill, navegación espacial, colocación del tooltip).
4. **Romper la API está permitido hasta 1.0**, sin alias de compatibilidad, actualizando tests y
   stories en el mismo paso.

## R.5 Respuestas a las tres preguntas del paso 13

1. **Evento unificado**: `MapItem<TDatum>` con `kind: "region" | "point"`, un solo `onItemClick` /
   `onItemHover` y un solo tooltip (`dd.md §9.2` y `§12.1`).
2. **Dónde vive el zoom**: en el DOM, no en React. `d3-zoom` escribe el `transform` del viewport y
   las variables `--cm-k` / `--cm-bubble-scale`; el CSS compensa trazos y burbujas; React solo se entera
   al **terminar** el gesto, vía `map-store` (`dd.md §11.0` y `§11.1.3`).
3. **Qué es un nivel**: geometría (cargada por la librería, con caché) + datos (del consumidor) +
   codificación visual, declarados con `defineDrillLevels`. El estado es no controlado por defecto
   (`drill={levels}`) y controlable (`useDrillDown({ path, onPathChange })`). Cada nivel se proyecta
   con un **rebase** de la proyección del padre para que el cambio de nivel sea invisible
   (`dd.md §11.2`).

**Siguiente paso: 14 (limpieza).** Después, los pasos de la fase A en orden.

---

# Paso 14: limpieza (`placeholder` fuera, tipos a `dependencies`)

Primer paso de la fase A. Corrige los problemas #4 y #11 de la revisión (R.2).

## 14.1 Qué se hizo

| Cambio                                                                                                                                                                | Por qué                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Borrados `core/placeholder.ts`, `react/placeholder.tsx`, sus 2 tests y `stories/placeholder.stories.tsx`; quitados sus `export` de `core/index.ts` y `react/index.ts` | Era andamiaje del paso 1 para probar la cadena tipos → tests → build → Storybook. Ya hay código real que la prueba, y `describeLibrary`/`Placeholder` estaban **en la API pública** sin ser API. |
| `@types/geojson` y `@types/topojson-specification` pasan de `devDependencies` a `dependencies`                                                                        | La API pública expone `Feature`, `FeatureCollection` y `Topology`. Los `.d.ts` de `dist/` los importan: si el consumidor no los tiene instalados, TypeScript los ve como `any` o falla.          |

## 14.2 Comprobación

`pnpm typecheck`, `pnpm lint`, `pnpm build` limpios; `pnpm test`: **200 tests** en verde (los 202 de la revisión menos los 2 del
placeholder). Sin efecto visual: no aplica la verificación en navegador (R.4 #1), salvo que la barra lateral de Storybook ya no
muestra «Setup → Placeholder».

## 14.3 Antes de pasar al paso 15: ¿lo tienes claro?

- ¿Por qué un tipo de `geojson` que aparece en un `.d.ts` exige `dependencies` y no `devDependencies`?
- ¿Qué ve un consumidor con TypeScript si no está `@types/geojson` instalado?

---

# Paso 15: `map-store` (el hover sale de `Root`)

Archivos: `src/react/map-store.ts` (+ test), reemplaza a `pointer-store.ts`. Toca `use-choropleth.ts`,
`choropleth-context.ts` y los componentes `Root`, `Regions`, `Selection` y `Tooltip`.
Corrige el problema n.º 1 de la revisión (R.2), el de severidad alta.

## 15.1 El problema

`hoveredId` era un `useState` dentro de `useChoropleth`. Cada vez que el cursor pasaba a otra región,
`Root` se re-renderizaba y recalculaba **join, escala, leyenda y burbujas**, aunque nada de eso
hubiera cambiado. Con 177 países no se nota; con miles de regiones, o con zoom, produce tirones.

## 15.2 La solución

```
 useChoropleth ── crea ──► store (hoveredId, pointer) ◄── lee con useMapStore(store, selector)
      │                                                       ▲                ▲
      └─ getRegionProps / Root escriben ─────────────────────┘                │
                                                        Selection (hoveredId)  Tooltip (pointer + hoveredId)
```

- **`createMapStore()`**: un objeto con `subscribe`, `getState` y `setState(parche)`. Es JS puro, sin
  React. `setState` **no notifica si el valor no cambia** (`Object.is`).
- **`useMapStore(store, selector)`**: `useSyncExternalStore` con un selector. Un componente solo se
  re-renderiza si **lo que su selector devuelve** cambia. `Selection` pide `hoveredId`; mover el cursor
  dentro de la misma región no lo toca. El `Tooltip` pide también `pointer`.
- **`Regions` lee el hover sin suscribirse** (`store.getState()` dentro del manejador). Necesita saber
  la región actual para no repetir `onRegionHover`, pero no pinta nada que dependa de ella.
- **Dueño del store: `useChoropleth`**, no `Root`. Así el nivel 3 (headless) también lo tiene: el
  resultado del hook trae `store` en lugar de `hoveredId`, y quien quiera el hover hace
  `useMapStore(store, s => s.hoveredId)` (ver `stories/headless.stories.tsx`).
- **El selector debe devolver algo estable** (primitivo o la misma referencia). Si crea un objeto
  nuevo en cada llamada, React entra en bucle. Está documentado en el código.

## 15.3 Decisiones y desviaciones respecto a `dd.md §21`

| Decisión                                                                                        | Motivo                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El store tiene solo `hoveredId` y `pointer`; **no** `focus`, `interacting`, cámara ni `status`. | Todavía no hay nada que los escriba (teclado: paso 16-17; cámara: fase B). Añadir un campo es una línea en `MapState`; declararlos ahora sería código muerto sin tests reales. |
| Los eventos siguen siendo `mouse*`.                                                             | Pasar a Pointer Events y `MapItem` es el paso 16; mezclarlo aquí haría el cambio difícil de revisar.                                                                           |
| `hoveredId` desaparece del resultado de `useChoropleth` sin alias.                              | Rotura permitida antes de 1.0 (R.4 #4). Tests y story actualizados.                                                                                                            |
| `createMapStore` y `useMapStore` se exportan.                                                   | El nivel 3 los necesita para leer el hover.                                                                                                                                    |

## 15.4 Tests

205 en verde (200 + 5 nuevos), `typecheck` y `lint` limpios, cobertura de `src/core` sin cambios.

- `map-store.test.tsx`: parches, no notificar si no cambia, desuscripción y **`useMapStore` no
  re-renderiza si cambia otro campo**.
- `choropleth.test.tsx`, «rendimiento»: el criterio de aceptación de `dd.md §21`. Para contar renders
  de `Root` sin tocar producción se cuenta cuántas veces se llama a `getId` (el join lo llama una vez
  por fila en cada render de `useChoropleth`). Tras hover entre dos regiones, mover el cursor y salir,
  el contador **no cambia**. Un test de control comprueba que sí sube cuando el consumidor
  re-renderiza, para que el primero no pase por casualidad.

## 15.5 Verificación visual (pendiente de ti) \*

No he podido abrir Storybook en un navegador. Por la regla R.4 #1, **revisa antes de seguir**:
`pnpm storybook` y, en `ChoroplethMap` y en la story headless, comprueba que (1) el borde del hover
sigue a la región, (2) el tooltip sigue al cursor y se voltea en las esquinas, (3) al salir del mapa
ambos desaparecen.

## 15.6 Antes de pasar al paso 16: ¿lo tienes claro?

- ¿Por qué `useMapStore` necesita un selector y qué pasa si devuelve un objeto nuevo cada vez?
- ¿Por qué `Regions` lee `store.getState()` en el manejador en lugar de suscribirse?
- ¿Cómo demuestra el test que `Root` no se re-renderiza, y por qué hay un test de control?

---

# Paso 16: `MapItem` unificado y Pointer Events

Archivos nuevos: `src/react/map-item.ts`. Tocan: `core/variants.ts` (`Bubble.coordinates`),
`map-store.ts`, `use-choropleth.ts`, `Regions`, `Bubbles`, `Selection`, `Tooltip`, `Root` y
`styles.css`. Corrige el problema n.º 5 de la revisión (R.2).

## 16.1 El problema

- Solo había eventos de ratón (`onMouseEnter`…): no funcionaban bien con táctil ni con lápiz.
- Las burbujas con coordenadas propias (tiendas) no recibían eventos: `pointer-events: none`.
- `RegionEvent` solo describía regiones. Una tienda no es una región, pero el consumidor quiere **un**
  handler y **un** tooltip.

## 16.2 Qué se hizo

**Un tipo para todo lo interactivo** (`dd.md §9.2`): `MapItem<TDatum>` es una unión discriminada por `kind`.

| `kind`     | Qué es                                                                    | Campos propios                                                          |
| ---------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `"region"` | Una región del mapa                                                       | `feature`, `datum` (`undefined` = sin dato)                             |
| `"point"`  | Una burbuja con coordenadas propias (`getCoordinates`), p. ej. una tienda | `coordinates`, `datum`, `feature` (la región de debajo, si el id cruza) |

Ambos llevan `level` y `drillable`. Mientras no exista el drill, `level` es siempre `{ id: "root", depth: 0 }` y
`drillable` es `false`. Están ya en el tipo para no romper la API otra vez en la fase C.

**API (se rompe sin alias, permitido antes de 1.0):**

| Antes                                   | Ahora                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `onRegionClick(event)`                  | `onItemClick(item: MapItem)`                                                |
| `onRegionHover(event \| null)`          | `onItemHover(item: MapItem \| null)`                                        |
| `RegionEvent`                           | `MapItem` (`RegionItem` \| `PointItem`)                                     |
| `getRegionProps` → `onMouseEnter/Leave` | `onPointerEnter/Leave`; nuevo `getPointProps` para `<circle>` de un punto   |
| `TooltipContext` = región + valor/color | `ItemContext` = `MapItem` + `value`, `formattedValue`, `color`, **`label`** |
| Store: `hoveredId: string \| null`      | `hovered: { kind, id } \| null` (un punto y una región pueden compartir id) |

El consumidor recibe en `onItemClick` / `onItemHover` un **superconjunto** de `MapItem` (también `value`, `color` y
`label`): es el mismo objeto que usa el tooltip.

**Dónde vive la lógica.** `useChoropleth` ahora devuelve `hoverItem(ref)`, `clickItem(ref)` y
`getItemContext(ref)`. `hoverItem` **no hace nada si el item no cambia** (ni toca el store ni llama a
`onItemHover`), así que el dedupe que antes tenía `Regions` está en un solo sitio y lo heredan el nivel 2 y el 3.

**Burbujas: dos tipos con interacción distinta.**

- En el **centroide de una región** (`coordinates: null`): siguen sin capturar el ratón; el item es la región de debajo.
- Con **coordenadas propias**: `pointer-events: auto` en su `<circle>` (el `none` del grupo se hereda y se anula
  ahí). Hover, clic, tooltip y un anillo de hover en `Selection`.

**Táctil.** No hay hover, y el navegador manda `pointerleave` justo al levantar el dedo, lo que quitaría la vista
previa al instante. Por eso, con `pointerType === "touch"`: el primer toque deja el tooltip y el resalte (vista
previa) y **se ignora `pointerleave`**; tocar el océano lo quita. `Root` actualiza la posición también en
`pointerdown`, porque un toque no genera `pointermove`.

## 16.3 Decisiones y desviaciones respecto a `dd.md §21`

| Decisión                                                                                                   | Motivo                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El «segundo toque = acción» NO está.** Hoy un toque deja la vista previa y además llama a `onItemClick`. | Esa regla de `dd.md §11.2.5` aplica a items **navegables** (`drillable`), y todavía no hay ninguno. Implementarla ahora sería código muerto sin comportamiento que probar. Va con el drill (fase C). |
| **Tocar fuera del mapa no quita la vista previa táctil.** Solo la quita tocar el océano o otra región.     | Detectarlo exige un listener global en `document`. Limitación conocida; se resuelve cuando haya más estado táctil (drill).                                                                           |
| **`selectedId` sigue siendo solo de regiones.**                                                            | La selección de puntos va en el paso 17 (selección controlada/no controlada).                                                                                                                        |
| El texto «Sin dato» sigue fijo en español en el tooltip.                                                   | Es el paso 18 (`labels`).                                                                                                                                                                            |
| `ItemContext.label` = `properties.name` de la región, o el id.                                             | Para un punto sin región cruzada es su id; el consumidor puede usar `renderTooltip` para mostrar lo suyo (`datum`).                                                                                  |

## 16.4 Tests

212 en verde (205 + 7 nuevos), `typecheck`, `lint` y `build` limpios; cobertura de `core` sin cambios.
Nuevos: un punto tiene hover/clic/tooltip/anillo y se desmonta al salir; las burbujas de centroide siguen sin
capturar; un punto y una región con el mismo id no se confunden; el punto enlaza su `feature`; táctil conserva la
vista previa tras `pointerleave`; con ratón, `pointerleave` sí quita el hover; `Bubble.coordinates` en `core`.
Los tests de hover que usaban `mouse*` pasan a `pointer*`, y el contador de renders de `Root` del paso 15 sigue en verde.

## 16.5 Verificación visual (pendiente de ti) \*

No he abierto Storybook. Revisa con `pnpm storybook`:

1. **Variants → BubbleStores**: pasar el ratón por una tienda la resalta con un anillo y muestra su tooltip;
   no hay hover de región debajo mientras estás sobre la burbuja.
2. **Variants → BubbleOnCountries**: el hover sigue funcionando a través de las burbujas (la región, no la burbuja).
3. En un móvil o con el modo táctil de las DevTools: el primer toque deja el tooltip fijo; tocar el mar lo quita.
4. El resto de stories: hover y clic como en el paso 15.

## 16.6 Antes de pasar al paso 17: ¿lo tienes claro?

- ¿Por qué `hovered` guarda `{ kind, id }` y no solo el id?
- ¿Por qué las burbujas de centroide no capturan eventos pero las de tienda sí?
- ¿Qué problema habría en táctil si se tratara `pointerleave` igual que con ratón?
- ¿Por qué `hoverItem` comprueba que el item haya cambiado antes de llamar a `onItemHover`?

---

# Pasos 17-22: cierre de la fase A

Se hicieron seguidos, por petición de iterar rápido hacia la cámara (fase B). Cada paso mantiene su
entrada, pero con el «orden interno» condensado. Estado al terminar: **274 tests** en verde (212 + 62
nuevos), `typecheck`, `lint`, `format:check`, `build` y `build-storybook` limpios, cobertura de
`src/core` 100 % líneas / 96,6 % ramas. Verificación visual: ver **§F.1**.

## Paso 17: selección controlada / no controlada y `dimOthers`

**Qué.** Tres props nuevas (`selectedId`, `defaultSelectedId`, `onSelectedIdChange`) y `dimOthers`.

| Modo          | Cómo se activa                               | Quién manda                                         |
| ------------- | -------------------------------------------- | --------------------------------------------------- |
| Sin selección | ninguna de las tres props                    | Un clic **no** selecciona ni cambia el cursor       |
| No controlada | `defaultSelectedId` y/o `onSelectedIdChange` | La librería; clic en la seleccionada la quita       |
| Controlada    | `selectedId` (incluido `null`)               | Tú: la librería solo avisa con `onSelectedIdChange` |

- **Solo se seleccionan regiones.** Los puntos no: su id puede coincidir con el de una región.
- **`dimOthers`** (`"never" | "selection" | "hover-and-selection"`, por defecto `"selection"`) no cambia
  ninguna prop de las regiones. `Root` pone `data-dim` y `data-has-selection` en el contenedor y el CSS baja
  la opacidad de `.cm-regions`; `Selection` pinta encima una copia **con el color de la región**, que queda a
  opacidad completa. El hover usa `:has(path[data-selection="hover"])`, también sin renders.
- **Desviación:** el default `"selection"` es el de `dd.md §12.1`, pero cambia lo que se ve en cuanto hay
  una región seleccionada (el resto se atenúa). Pon `dimOthers="never"` para el comportamiento anterior.

## Paso 18: `labels` (i18n)

`core/labels.ts`: `ChoroplethLabels` (`noData`, `geographyError`), `en` por defecto, `es` exportado y
`resolveLabels`. `Tooltip` y el preset (`emptyLabel`) leen de ahí; ya no queda español fijo en la UI. Cada
fase añadirá sus claves (`drillHint`, `breadcrumbRoot`…). **Los mensajes de consola siguen en inglés** y no
pasan por `labels`. (Los `throw new Error(...)` también están ya en inglés y con el prefijo `[choropleth]`: ver «Decisiones
tras la revisión de la fase A».)

## Paso 19: geometría robusta

| Problema (R.2)   | Solución                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2 agujeros      | Las regiones sin id se pintan en una **capa no interactiva** (`.cm-region--anonymous`, `emptyFill`, cursor normal). Pasar el cursor por ellas quita el hover de la región anterior. |
| #7 trazos        | `vector-effect: non-scaling-stroke` también en `.cm-borders` y en el contorno de las regiones (GeoJSON).                                                                            |
| #8 proporción    | `aspectRatio: number \| "auto"`. `"auto"` = `computeAspectRatio` (core): ajusta la proyección a un ancho de referencia y mide el rectángulo; limitado a [0,2 – 5].                  |
| `filterFeatures` | Descarta regiones **y sus fronteras** (`createBorders` solo dibuja una frontera si se conservan los dos lados).                                                                     |

Dos decisiones con consecuencias:

- **`filterFeatures` se memoiza por su resultado, no por su identidad.** Se evalúa en cada render (O(regiones)),
  pero la dependencia del `useMemo` es la lista de índices que sobreviven. Así
  `filterFeatures={(f) => f.id !== "AQ"}` en línea (lo natural) **no recalcula las rutas**.
- **`useContainerSize` guarda solo lo medido.** El alto derivado de la proporción se calcula al renderizar. Si
  `aspectRatio` cambia (con `"auto"`, al terminar de cargar la geometría), el alto se corrige sin esperar a
  otro evento de `ResizeObserver`.

Bug encontrado por los tests: d3 devuelve `[NaN, NaN]`, no `null`, para una coordenada que no sabe proyectar.
Se normaliza en un único sitio (la función `project` del hook).

## Paso 20: `getFocusGeometry` + anclas `polylabel`

`core/bounds.ts`, con tests antes que el componente:

- `getFocusGeometry({ feature, path, near })`: el polígono de mayor **área proyectada** + los que están a
  menos de `near × diagonal` de él. Francia sin Guayana; EE. UU. sin Alaska/Hawái; Noruega sin Svalbard.
- `getAnchorPoint({ geometry, project })`: `polylabel` del polígono proyectado más grande. Siempre cae
  **dentro** (el test usa una «U» cuyo centroide cae en el hueco).

`useChoropleth` ancla las burbujas ahí (con el centroide de respaldo si no hay polígono). Nueva dependencia
**`polylabel`** (en `dependencies`; `@types/polylabel` en `devDependencies`, sus tipos no aparecen en la API
pública). Los `focusBounds` por nivel (Canarias) y el uso para encuadrar llegan con la cámara (fase B).

⚠️ **Trampa de los tests:** los cuadrados de prueba deben ir en sentido **horario**; con el sentido contrario
d3 interpreta «todo el globo menos el cuadrado» (el _winding order_ de `dd.md §2.9`).

## Paso 21: `geography` asíncrona con caché + `data: undefined` = cargando

- **`GeographyInput`** = dato | `Promise` | `() => import("…")` (vale el módulo entero con `default`).
  Un dato síncrono se devuelve **en el mismo render** (sin efecto ni parpadeo).
- **`useGeography`** (`use-geography.ts`): carga en un efecto real. Caché por `geographyKey` o, si no, por la
  identidad de la función/promesa; un segundo mapa con la misma clave **no parpadea** (se lee de la caché
  en el render). Un fallo no se cachea.
- **Función en línea:** `geography={() => import(…)}` cambia de identidad en cada render. No entra en bucle
  (el módulo devuelve el mismo objeto y React no re-renderiza), pero la caché solo sirve con una función
  estable o con `geographyKey`. Hay test.
- **Estados:** `status` = `loading` → `Svg` pinta un **esqueleto con la proporción** que tendrá el mapa (la
  página no salta); `error` → `role="alert"` con `labels.geographyError` y `onGeographyError` (sin él,
  `console.error` en inglés). `Root` expone `data-status`.
- **`data: undefined`** = datos en camino: se **mantiene el último dato** (en una `ref`, no en estado: `data`
  suele llegar con identidad nueva en cada render y guardarlo en estado provocaría un render por cada una),
  `data-loading` en el contenedor hace «respirar» el mapa y **no hay avisos de consola**. `loading` fuerza el
  estado. El diagnóstico de join no se ejecuta hasta que la geometría está lista.

## Paso 22: `src/geo` (nuevo _entry point_ `choropleth-kit/geo`)

| Export                | Qué es                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `world110m`           | `world-atlas` a 1:110m con **ids ISO alpha-2** (`"ES"`) y `properties.name`. Objeto `countries`. 177 regiones, **Kosovo = `"XK"`**. |
| `isoNumericToAlpha2`  | Tabla de los 250 códigos ISO (`"724"` → `"ES"`), para quien use `world-atlas` directamente.                                         |
| `worldFallbackPoints` | `[lon, lat]` de 42 microestados y territorios ausentes a 1:110m (Andorra, Mónaco, Singapur, Hong Kong…). No exhaustivo.             |

- **Se genera, no se escribe a mano:** `scripts/build-geo/build-world-110m.mjs` (`world-atlas` +
  `i18n-iso-countries`, ambas **devDependencies**) y la salida **se commitea**. Chipre del Norte y Somalilandia
  no tienen código: quedan sin id y salen como capa anónima (paso 19).
- **`fallbackPoints`** (prop, nuevo): un dato cuyo id no cruza con ninguna región pero está en la tabla se
  pinta como **punto** (item `point`: hover, clic, tooltip) con el color de su dato; en `bubble`, como burbuja.
  Entra en la leyenda y **deja de salir en el aviso de ids sin cruzar**. Nuevo componente
  `<Choropleth.FallbackPoints>`, incluido en `Svg`.
- **Peso:** ver «Decisiones tras la revisión de la fase A» (`geo.js` ≈ 128 KB / 42 KB gzip, y es opcional). El presupuesto de `dd.md §14.2` se mide con `size-limit`
  cuando se añada.
- ⚠️ **Fronteras disputadas:** son las de Natural Earth, tal cual (`dd.md §6.2`). Hay que validarlas con
  Legal/Comunicación antes de mostrar un mapa en una herramienta de empresa. Está en el comentario del export.
- Las stories pasan a `world110m` (ids alpha-2) con un `seed(id)` determinista (`stories/seed.ts`).

## F.1 Verificación visual (parcialmente hecha; el resto, pendiente de ti) \*

No hay navegador en esta sesión. Lo que sí se hizo: renderizar a SVG con `react-dom/server`, convertirlo a PNG
y mirarlo (sin CSS, así que **no** cubre atenuado, esqueleto ni pulso). Visto y correcto:

- Las burbujas de EE. UU. y Francia caen en el **territorio continental** y en Francia (no en Alaska ni en el
  Golfo de Vizcaya).
- Los microestados (Singapur, Maldivas, Bahréin, Mónaco, Malta…) aparecen como puntos con color.

**Revisa en `pnpm storybook` → «Foundations (fase A)»** (todo lo que depende de CSS o de interacción):

| Story                                             | Qué comprobar                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SelectionAndDim`                                 | Clic selecciona/deselecciona; con `selection` el resto se atenúa y España mantiene su color; con `hover-and-selection`, también al pasar el cursor. |
| `Labels`                                          | El tooltip de un país gris cambia entre «No data», «Sin dato» y «—».                                                                                |
| `NoHoles`                                         | Kosovo con color; Chipre del Norte y Somalilandia en gris; sin huecos.                                                                              |
| `AutoAspectRatio`                                 | Con Chile el contenedor es alto; con Noruega, ancho. Sin franjas en blanco.                                                                         |
| `AnchorsBeforeAfter`, `BubblesOnProblemCountries` | Rojo (antes) frente a azul (ahora) en Francia, EE. UU., Rusia, Noruega, Países Bajos.                                                               |
| `AsyncLoading`                                    | Esqueleto → mapa gris que «respira» → datos. Sin saltos de altura. Con reduced-motion, sin animación.                                               |
| `GeographyError`                                  | Mensaje de error, no un mapa vacío.                                                                                                                 |
| `Microstates`                                     | Puntos con hover, tooltip y clic (consola).                                                                                                         |
| Todas las anteriores                              | Hover y tooltip siguen funcionando; el borde del hover **no engorda** con el zoom del navegador.                                                    |

## F.2 Qué queda de la auditoría (R.2) y preguntas abiertas

**Corregidos en la fase A:** #1, #2, #3, #4, #5, #6, #7, #8, #11. **Pendientes por diseño:** #9 (a11y:
`role="img"` oculta los hijos; se decide en `dd.md §13.4`), #10 (colocación del tooltip: `placeTooltip`, fase D),
#12 (FLIP de burbujas, fase D) y #13 (`rebaseProjection`, fase C).

Preguntas abiertas (para ti):

1. ¿`dimOthers` por defecto en `"selection"` (como dice `dd.md`) o preferimos `"never"` hasta que haya zoom?
2. Los `throw new Error(...)` de `core` están en español; `dd.md §21` pide mensajes de consola en inglés. ¿Los unificamos?
3. ¿Qué hacemos con Chipre del Norte y Somalilandia (hoy, capa gris sin id)? Es una decisión de Legal, no técnica.
4. Peso de `choropleth-kit/geo` (196 KB): ¿aceptable, o generamos también una versión más simplificada?

**Siguiente: paso 23 (fase B, cámara).** `core/camera.ts` y `core/bounds.ts` (`boundsToTransform`, etc.), solo tests.

## Decisiones tras la revisión de la fase A

Respuestas a las preguntas abiertas de §F.2:

1. **`dimOthers`:** se queda en `"selection"` por defecto (como dice `dd.md §12.1`).
2. **Errores en inglés:** los `throw new Error(...)` de `core` y de `react` pasan a inglés, con el prefijo
   `[choropleth]`, como los avisos de consola (`dd.md §21`). Tests actualizados.
3. **Chipre del Norte y Somalilandia:** se queda como está (capa gris sin id); decisión de Legal, no técnica.
4. **Peso de `geo`:** ver abajo.

**Qué es `dist/geo.js` y si entra en el bundle.** Es el _entry point_ opcional `choropleth-kit/geo`
(`world110m`, `isoNumericToAlpha2`, `worldFallbackPoints`). **No entra en el bundle principal**: `index.js`
y `core.js` no lo importan (comprobado con `grep` sobre `dist/`); solo lo paga quien escriba
`import … from "choropleth-kit/geo"`. Quien traiga su propia geometría no lo carga. Dentro de `geo.js`, el
mundo es casi todo el peso, y los otros dos exports son tree-shakeables si no se usan.

**Corrección de un error mío:** al medirlo salió **196 KB**, el doble de lo esperado. `prettier --write src`
había reformateado `world-110m.json` (que se genera compacto) con sangrías. Está en `.prettierignore`,
regenerado, y el tamaño real es:

| Archivo                             | Sin comprimir | gzip    | brotli  |
| ----------------------------------- | ------------- | ------- | ------- |
| `dist/geo.js`                       | 128 KB        | 42 KB   | 35 KB   |
| `dist/index.js` + chunk compartido  | 55 KB         | ≈ 16 KB | ≈ 14 KB |
| `world-atlas` original (referencia) | 105 KB        | 38 KB   | —       |

Es esencialmente la geometría (`world-atlas` con los ids cambiados), ya al mínimo razonable a 1:110m. Para
bajarlo hay que simplificar (mapshaper, `dd.md §2.6`) o cargarlo bajo demanda con
`geography={() => import("choropleth-kit/geo")…}`, que el paso 21 ya permite.

---

# Paso 23: `core/camera.ts` y `boundsToTransform` (la matemática de la cámara)

Archivos: `src/core/camera.ts`, `src/core/camera.test.ts`; `boundsToTransform` y `normalizePadding` en
`src/core/bounds.ts`. Primer paso de la fase B. **No hay efecto visual** y no se toca React: es la
tarea 10 de `dd.md §21` («solo tests»), y la regla R.4 #3 («lo puro, a `core`, con tests antes que el
componente»).

## 23.1 El modelo mental (`dd.md §11.0`)

Un mapa se separa en dos cosas:

- **El lienzo**: el mapa ya proyectado a píxeles (las rutas `d`). Se calcula una vez por nivel y tamaño.
- **La cámara**: un `transform` afín `{ k, x, y }` (escala + traslación). Un punto del lienzo `[px, py]` se
  ve en pantalla en `[px·k + x, py·k + y]`. **`k = 1` es el encaje**: el mapa cabe justo en el contenedor.

Zoom y pan **no recalculan rutas**: solo cambian la cámara. Por eso toda la lógica de «dónde está la cámara y
adónde puede ir» es aritmética sobre tres números, sin DOM ni `d3-zoom`. Se escribe y se prueba aquí; el
paso 24 solo la conecta a los gestos.

## 23.2 Las funciones

| Función                                | Responde a                                                                | Notas                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyTransform` / `invertTransform`   | Lienzo ↔ pantalla                                                         | Las dos mitades de la misma fórmula; los tests las usan como oráculo.                                                                         |
| `constrainAxis` / `constrainTransform` | ¿Hasta dónde se puede arrastrar?                                          | Si el contenido **cabe**, lo centra; si no, impide que sus bordes entren en la vista. `overscroll` = holgura elástica (fracción de la vista). |
| `boundsToTransform` (`bounds.ts`)      | ¿Qué cámara encaja estos límites con margen?                              | Destino de «zoom a un país». Respeta `scaleExtent` y no devuelve `Infinity`/`NaN` con límites degenerados.                                    |
| `preserveView`                         | ¿Cómo no «volver al encaje» al redimensionar?                             | Conserva el **centro geográfico** y la `k`; si el centro cae fuera del globo, devuelve el encaje.                                             |
| `flightDuration`                       | ¿Cuánto dura un vuelo?                                                    | La duración natural de `interpolateZoom` × `speed`, acotada a **[350, 1200] ms**.                                                             |
| `inertiaOffset`                        | ¿Cuánto se desliza el mapa tras soltar?                                   | `v·τ·(1 − e^(−t/τ))`, τ = 325 ms (la de iOS). Tiende a `v·τ` sin superarlo.                                                                   |
| `toViewState`                          | ¿Qué le digo al consumidor (`onViewChange`)?                              | `{ k, x, y, zoom, center, bounds, level }` con coordenadas geográficas.                                                                       |
| `transformToZoomView`                  | Cámara → «vista» de `interpolateZoom` (centro x, centro y, ancho visible) | Pieza interna de `flightDuration`; se exporta porque el paso 26 también la necesita.                                                          |

## 23.3 Por qué cada una es como es (lo que no es evidente)

- **`constrainAxis` centra en vez de pegar a una esquina.** El `translateExtent` por defecto de d3 deja un
  mapa más pequeño que la vista en una esquina. Con `k = 1` el contenido cabe justo: no hay nada que
  arrastrar (el test lo comprueba: cualquier `t` da 0). Esa propiedad hace que el cursor `grab` no tenga que
  aparecer en el encaje.
- **`boundsToTransform` clampa `k` y aun así centra.** Si el país es tan pequeño que haría falta más zoom
  del permitido, la cámara se queda en `max` pero con el país **en el centro**, no en un lado. Un margen que
  se come toda la vista baja a `min` en lugar de dar una escala negativa.
- **`preserveView` trabaja con funciones, no con proyecciones.** Recibe `invertOld` (píxeles → lon/lat) y
  `projectNew` (lon/lat → píxeles). Así se prueba con proyecciones reales de d3 sin acoplar `core` a una forma
  concreta, y el test comprueba lo importante: el centro geográfico **antes y después** de redimensionar es el
  mismo (a 3 decimales).
- **`toViewState` muestrea la vista.** Un mapa del mundo en Equal Earth no es un rectángulo: las **esquinas
  de la vista caen fuera del globo** y `invert` da `null`. Los límites se estiman con una rejilla de 5 × 5
  puntos de la vista, descartando los que no proyectan. Si ninguno proyecta, devuelve el mundo entero y el
  centro `[0, 0]`. Son límites **aproximados** (no contemplan el antimeridiano), como dice `dd.md §11.1.7`.
- **`flightDuration` cae al mínimo ante un transform inválido** (`NaN`) en vez de propagar `NaN` a una
  animación.

## 23.4 Un problema que apareció (y cómo se detectó)

`dd.md §11.1.5` pide `interpolateZoom` con curvatura ρ (1,2–1,3 para dashboards). `@types/d3-interpolate`
declara `rho` **en el interpolador ya creado** (`interpolateZoom(a, b).rho(r)`), pero **en runtime ese método
no existe** (`undefined`): vive en la **función** (`interpolateZoom.rho(r)(a, b)`). El `typecheck` pasa con el
código correcto según los tipos y **rompe con el real**.

Cómo se vio: tras corregir el typecheck, la primera ejecución de los tests dio «38 passed» porque aún
usaba la otra forma; al reejecutar toda la suite fallaron 6 tests de `flightDuration`, y una prueba de una
línea con `node -e` lo confirmó (`fn.rho: function`, `instance.rho: undefined`). Se usa lo que hace de verdad
con un cast tipado y un comentario, y hay un test («la curvatura se aplica de verdad») que falla si alguien
«arregla» el código para contentar a los tipos.

> **Lección para el resto de la fase:** con d3, los `@types` no son una garantía de runtime. Cuando un
> método venga de un `@types` y no de la documentación del módulo, probarlo con una línea de `node`.

## 23.5 Decisiones y desviaciones respecto a `dd.md`

| Decisión                                                                                                           | Motivo                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundsToTransform` está en `bounds.ts` (donde lo sitúa `dd.md §11.1.5`) y el resto en `camera.ts`.                | Es lo que dice el documento; la tarea 10 menciona ambos archivos.                                                                                           |
| **No** se implementa la velocidad de suelta de la inercia (muestras de los últimos 100 ms, umbral 0,3 px/ms).      | Solo la usa `use-zoom` en el paso 27. Hacerlo ahora sería código sin consumidor. `inertiaOffset`, que sí está en la tarea 10, es lo único que se pide aquí. |
| `ViewState.level` es `{ id, depth }` (`ViewLevel`), duplicando la forma de `DrillLevelInfo` (`react/map-item.ts`). | `core` no puede importar de `react`. Cuando llegue el drill (fase C) se unifica moviendo el tipo a `core`.                                                  |
| Dependencia nueva: **`d3-interpolate`** (`dependencies`) + `@types/d3-interpolate` (dev).                          | Permitida por `dd.md §21`; da `interpolateZoom`. Las demás (`d3-zoom`, `d3-selection`, `d3-transition`, `d3-ease`) se añaden en el paso que las usa.        |
| `DEFAULT_FLIGHT_CURVATURE = 1.25`.                                                                                 | El punto medio del rango 1,2–1,3 que recomienda `dd.md` para dashboards.                                                                                    |

## 23.6 Tests

312 en verde (274 + 38 nuevos), `typecheck`, `lint`, `format:check` y `build` limpios; cobertura de `src/core`
100 % en líneas. Cubren: ida y vuelta lienzo↔pantalla; centrado cuando cabe y límites duros/elásticos
(incluido un contenido que no empieza en 0); encaje con margen simétrico y asimétrico, país minúsculo y
enorme, límites degenerados y margen excesivo; **centro geográfico conservado al redimensionar** con
proyecciones reales; duración siempre en [350, 1200], más larga cuanto más lejos, sin `NaN`; inercia (0 al
soltar, límite `v·τ`, 63,2 % a `t = τ`, monotonía, entradas inválidas); `toViewState` con Mercator, con
Equal Earth (esquinas fuera del globo) y con `invert` que falla.

## 23.7 Verificación visual

No aplica: no hay UI en este paso. Lo primero que se verá es el paso 24.

## 23.8 Antes de pasar al paso 24: ¿lo tienes claro?

- ¿Por qué `k = 1` es «el encaje» y no una escala arbitraria? ¿Qué se simplifica con eso?
- Con `constrain: "contain"` y `k = 1`, ¿por qué no hay nada que arrastrar?
- ¿Qué dos cosas conserva `preserveView` al redimensionar, y qué hace si el centro cae fuera del globo?
- ¿Por qué `toViewState` muestrea una rejilla en vez de invertir las cuatro esquinas?
- ¿Qué pasó con `interpolateZoom.rho` y qué test lo vigila?

## 23.9 Decisiones del humano para la fase B (respuestas a `dd.md §21`)

1. **Rueda: `wheel` es una prop con tres valores y por defecto `"always"`.** Mientras el ratón esté sobre
   el mapa, la rueda hace zoom. `"cooperative"` es opt-in: la rueda solo hace zoom con **Ctrl/⌘ + rueda**
   (la página sigue haciendo scroll y aparece el aviso del `GestureHint`); `"never"` la desactiva.
   **Desviación de `dd.md §11.1.1`**, que pone `"cooperative"` por defecto: se hace así por decisión del
   humano. Consecuencia a vigilar: con `"always"`, un mapa dentro de una página con scroll «secuestra» la
   rueda al pasar por encima (el _scroll-jacking_ del que avisa `dd.md §11.1.2`); la documentación de la prop
   debe decirlo y recomendar `"cooperative"` para mapas incrustados en dashboards largos. El filtro de
   gestos de `dd.md §11.1.2` se implementa tal cual, solo cambia el valor por defecto.
2. **España se encuadra con las islas (Canarias incluidas).** El encuadre por defecto de España no usa el
   cuerpo principal de `getFocusGeometry` (que descarta Canarias) sino la geometría completa; se
   implementa en el paso 26 (`focusId` / `zoomTo`) como un override por defecto de `focusBounds` para `ES`
   (`[[-18.5, 27.5], [4.5, 44]]`, el ejemplo de `dd.md §11.1.5`), documentado y sustituible por el consumidor.
   Otros países con territorios lejanos (Francia, EE. UU., Portugal) siguen usando el cuerpo principal.

---

# Paso 24: `use-zoom.ts` + `Viewport` (el primer zoom visible)

Archivos nuevos: `src/core/zoom.ts` (+ test), `src/react/use-zoom.ts`, `src/react/components/viewport.tsx`,
`src/react/zoom.test.tsx`, `stories/zoom.stories.tsx`. Tocan: `map-store.ts`, `use-choropleth.ts`, `Root`,
`Svg`, `choropleth-context.ts` y `styles.css`. Tarea 11 de `dd.md §21`: «§11.1.3 al pie de la letra».

## 24.1 El problema que resuelve este paso

`d3-zoom` y React no se llevan bien por defecto: `d3-zoom` quiere escribir en el DOM en cada frame, y React
quiere ser el único dueño del DOM. La regla de `dd.md §11.1.3` es: **React nunca escribe el `transform`
del viewport; `d3-zoom` sí, y React solo se entera al terminar el gesto**. Todo el diseño sale de ahí.

| Qué cambia                                          | Quién lo escribe           | Cuándo                     | ¿Render de React? |
| --------------------------------------------------- | -------------------------- | -------------------------- | ----------------- |
| Atributo `transform` de `.cm-viewport`              | `d3-zoom` (`setAttribute`) | **cada frame**             | **Nunca**         |
| `--cm-k` y `data-zoomed` en `.cm-root`              | `d3-zoom` (DOM directo)    | cada frame                 | Nunca             |
| `data-interacting` en `.cm-root`                    | suscripción al store (DOM) | empieza / termina el gesto | Nunca             |
| `interacting`, `camera` (confirmada) en `map-store` | `use-zoom`                 | empieza / termina el gesto | Solo suscriptores |
| `onViewChange` del consumidor                       | `use-zoom`                 | **al terminar** el gesto   | Lo que él haga    |

## 24.2 Qué se hizo

**`core/zoom.ts` (puro, con tests).**

- `ZoomOptions` / `resolveZoomOptions`: `zoom` (`boolean | objeto`) → opciones completas o `null`. Valida
  `min > 0`, `max` finito y `≥ min`. `doubleClick: "auto"` se resuelve a `false` si el clic ya tiene otro
  significado (`onItemClick` o selección), para no hacer las dos cosas a la vez.
- `createZoomFilter`: sustituye al filtro por defecto de d3 (`(!ctrlKey || wheel) && !button`). Recibe
  eventos «de mentira» (`{ type, ctrlKey, touches… }`), así que se prueba sin DOM. Devolver `false` **no
  llama a `preventDefault`**: en `cooperative` la página sigue haciendo scroll.

**`react/use-zoom.ts`.** El único sitio con `d3-selection`. En un `useEffect` (es un efecto real: eventos del
DOM con limpieza) crea el `zoom()`, lo engancha al `<svg>` y:

1. `extent` y `scaleExtent([min, max])`.
2. **`clickDistance(4)`**: el valor por defecto de d3 es 0, y cualquier micro-temblor del ratón se come el clic.
3. El filtro de gestos, con el aviso (`store.showGestureHint`) cuando la rueda no hace zoom.
4. `start` → `interacting = true` (solo si el gesto es del usuario, no un vuelo programático);
   `zoom` → 3 escrituras en el DOM; `end` → cámara confirmada al store, `interacting = false` y `onViewChange`.
5. `constrain` propio (el de `core/camera.ts`): centra si cabe, no deja salir los bordes. `"free"` lo desactiva.
6. En `cooperative`, `touch-action: pan-x pan-y` (d3 pone `none`, que **bloquea el scroll táctil** de la página).
7. Restaura la cámara confirmada al (re)instalar, **sin avisar** (`restoring`: no es un gesto).

**`<Choropleth.Viewport>`**: el `<g class="cm-viewport">` al que se aplica el transform. No tiene ninguna prop
que toque `transform`. `Svg` lo incluye por defecto (y llama a `useZoom`); si pasas tus propias capas, envuélvelas
en `<Choropleth.Viewport>`.

**CSS** (todo por atributos, sin renders): cursor `grab` solo si `data-zoomed` (en el encaje no hay nada que
arrastrar) y `grabbing` si `data-interacting`; durante el gesto, regiones/burbujas con `pointer-events: none`, sin
transiciones de color y tooltip oculto (arrastrar sobre 200 países dispararía 200 hovers).

## 24.3 Por qué el orden interno es ese

| #   | Paso                                    | Por qué va aquí                                                                                            | Qué pasaría si se invierte                                                                   |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `scaleExtent`, `clickDistance`, filtro  | Se configuran **antes** de `.call(behavior)`: d3 lee la configuración al enganchar los listeners.          | Cambiar `clickDistance` después no afectaría a los gestos ya enganchados con otro valor.     |
| 2   | `.constrain(...)`                       | Antes de `.call`, y **antes** de restaurar la cámara: la restauración también pasa por `constrain`.        | Una cámara restaurada de otro tamaño podría quedar fuera de los límites.                     |
| 3   | `select(svg).call(behavior)`            | Instala los listeners (`wheel`, `mousedown`, `touchstart`…).                                               | —                                                                                            |
| 4   | `touch-action` **después** de `.call`   | d3 lo escribe dentro de `.call`; el nuestro tiene que ir detrás para ganar.                                | d3 lo pisaría con `none` y la página dejaría de poder hacer scroll con un dedo.              |
| 5   | `behavior.transform(selection, camera)` | Restaura la cámara con los listeners ya activos, para que escriba el DOM por el mismo camino que un gesto. | Habría dos caminos de escritura (uno de restauración y otro de gesto) y se desincronizarían. |

## 24.4 Decisiones y desviaciones respecto a `dd.md`

| Decisión                                                                                                                                      | Motivo                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`wheel` por defecto = `"always"`**, no `"cooperative"` (§23.9, decisión del humano).                                                        | Con el ratón encima, la rueda hace zoom. `cooperative` es opt-in. El comentario de la prop avisa del _scroll-jacking_.                                                                                                            |
| `ZoomOptions` solo tiene lo que hace algo: `min`, `max`, `wheel`, `pinch`, `pan`, `doubleClick`, `constrain`, `onViewChange`.                 | `controls`, `keyboard`, `inertia`, `padding`, `initialView` se añaden en los pasos 25-27 con su comportamiento. Declararlas antes sería prometer lo que no existe.                                                                |
| El filtro refina `pan` y `pinch` en táctil: con `pan = false` un dedo no arrastra pero dos dedos sí pellizcan.                                | El filtro de `dd.md` los ignora. Sin esto, `pan: false` seguiría dejando arrastrar con el dedo.                                                                                                                                   |
| `onViewChange` **no** forma parte de las opciones resueltas: se lee con una `ref` al usarlo.                                                  | Suele ser una función en línea: si fuera dependencia del efecto, se reinstalaría `d3-zoom` en cada render. Lo mismo para `invert`.                                                                                                |
| `data-interacting` se escribe **en el DOM** mediante una suscripción al store, no como prop de `Root`.                                        | Como prop, empezar y terminar cada gesto re-renderizaría todo el mapa (join, escala, leyenda).                                                                                                                                    |
| El store gana `interacting`, `camera`, `gestureHint`, `showGestureHint` y `dispose`; **no** `registerZoom`, `liveCamera` ni `setInteracting`. | `setState` ya cubre lo primero; `registerZoom` (para `zoomTo`) lo necesita el paso 25-26 y `liveCamera` los `Marker` (paso 37). Sin consumidor ahora, no se añaden.                                                               |
| **`--cm-bubble-scale` y el resize sin salto NO están** (paso 27).                                                                             | Hoy **las burbujas crecen con el zoom** (son círculos dentro del viewport escalado). Al redimensionar con `k > 1`, la cámara se conserva en píxeles y la vista se desplaza; con `k = 1` no pasa nada. Ambos se arreglan en el 27. |
| `Svg` es quien llama a `useZoom`.                                                                                                             | Es quien tiene el `<svg>`. Quien use `useChoropleth` (nivel 3) y pinte su propio `<svg>` debe llamar a `useZoom` él mismo (está exportado).                                                                                       |
| Las capas que se pasan a `<Svg>` a mano deben ir dentro de `<Choropleth.Viewport>`.                                                           | Si no, no se mueven con el zoom. `dd.md §9.3` ya lo muestra así.                                                                                                                                                                  |

## 24.5 Tests

372 en verde (312 + 60 nuevos), `typecheck`, `lint`, `format:check`, `build` y `build-storybook` limpios; cobertura de
`src/core` 100 % líneas / 97 % ramas.

- **`core/zoom.test.ts` (24):** defaults, validación, `doubleClick: "auto"`, y el filtro caso a caso (rueda en los
  tres modos, aviso, Ctrl y ⌘, táctil con uno y dos dedos, `pan`/`pinch`, botón secundario, doble clic).
- **`react/zoom.test.tsx` (34), simulando gestos reales sobre `d3-zoom` en jsdom:**
  - rueda: zoom **anclado al cursor** (el punto bajo el cursor no se mueve), límites `min`/`max`, `never`,
    `cooperative` (**no se llama a `preventDefault`**, `touch-action`, Ctrl y ⌘);
  - arrastre: con `k = 1` no hay nada que arrastrar, ampliado sí y con límites, `pan: false`, botón secundario;
  - **clic ≠ arrastre:** 2 px de temblor sigue siendo clic; un arrastre real no produce clic;
  - `data-interacting` durante el gesto y fuera al terminar; `onViewChange` **una sola vez**, al terminar, y **nunca
    al montar**;
  - **rendimiento:** diez eventos de rueda y un arrastre **no re-renderizan `Root`** (contador de `getId`, la misma
    técnica del paso 15), y tampoco al terminar;
  - **React no pisa la cámara:** un render con datos nuevos a mitad de un zoom no reinicia el transform; opciones
    en línea con los mismos valores **no reinstalan** `d3-zoom`; al cambiar una opción se reinstala y se restaura la
    cámara; cambiar el tamaño la conserva; `zoom` true → false quita los gestos;
  - el zoom se engancha cuando el `<svg>` aparece tras la carga asíncrona.
- **Comprobación de que los tests detectan lo que dicen** (mutaciones hechas a mano y revertidas): con
  `clickDistance(0)` falla «2 px de temblor sigue siendo un clic»; quitando el guard `restoring` fallan los dos
  tests de `onViewChange`.

Dos trampas de jsdom, documentadas en el test: (1) `MouseEvent.view` no se puede pasar en el constructor, así que se
fija con `defineProperty` (d3 engancha `mousemove`/`mouseup` a `event.view`); (2) `d3-zoom` quita su supresor de clic
con un `setTimeout(…, 0)` que con temporizadores falsos no corre y se quedaba en la `window`, tragándose el clic del
test siguiente. En un navegador real sí corre.

## 24.6 Verificación visual: pendiente de ti \*

No hay navegador en esta sesión, y este es el primer paso donde lo visual importa de verdad (jsdom no tiene layout).
Abre `pnpm storybook` → **Zoom / Basic** y comprueba:

| Story                          | Qué comprobar                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Default`                      | La rueda hace zoom **anclado al cursor**; arrastrar desplaza; no se puede arrastrar fuera del mapa; con el mapa entero a la vista, **el cursor no cambia** (no es `grab`) y al ampliar pasa a `grab`/`grabbing`. |
| `Default`                      | **Las fronteras y el contorno del hover NO engordan** al ampliar (`non-scaling-stroke`). El tooltip **no parpadea** ni sale mientras arrastras.                                                                  |
| `Default`                      | Doble clic = ×2 (animado). La línea de `onViewChange` solo se actualiza **al terminar** el gesto.                                                                                                                |
| `Default` (trackpad)           | El pellizco funciona (llega como Ctrl + rueda). **Safari** puede emitir eventos `gesture*` distintos: `dd.md §11.1.2` pide verificarlo.                                                                          |
| `CooperativeInAScrollablePage` | Rueda sobre el mapa: **la página hace scroll**, el mapa no se mueve. Ctrl/⌘ + rueda: zoom. (Aún no hay aviso visual: es el paso 25.)                                                                             |
| `ClickVersusDrag`              | Un clic con un pequeño temblor **selecciona** (sube el contador de clics); arrastrar no selecciona nada al soltar. El doble clic **no** hace zoom (hay `onItemClick`).                                           |
| `PanOnly`                      | La rueda no hace nada; arrastrar sí.                                                                                                                                                                             |
| Móvil / DevTools táctil        | `cooperative`: un dedo hace scroll de la página, dos dedos mueven el mapa. `dd.md` pide probar en **iOS Safari y Chrome Android** reales.                                                                        |
| Cualquiera con burbujas        | Esperado y **pendiente del paso 27**: las burbujas **crecen** al hacer zoom.                                                                                                                                     |

## 24.7 Antes de pasar al paso 25: ¿lo tienes claro?

- ¿Por qué React no puede escribir el atributo `transform` del viewport? ¿Qué pasaría si lo hiciera?
- ¿Qué cosas se escriben por frame y cuáles solo al empezar o terminar el gesto?
- ¿Por qué `clickDistance(4)` y qué ocurre con el valor por defecto de d3?
- ¿Por qué `touch-action` se escribe **después** de `.call(behavior)`?
- ¿Por qué `onViewChange` y `invert` se leen desde una `ref` en lugar de ser dependencias del efecto?
- ¿Cómo demuestra un test que el zoom no re-renderiza `Root`, y qué mutación demuestra que el test sirve?

## 24.8 Pregunta abierta

Con `wheel: "always"` por defecto y el mapa dentro de una página con scroll, el mapa se come la rueda. ¿Quieres
que el preset (`<ChoroplethMap>`) lo avise en desarrollo, o basta con la documentación de la prop?

---

# Paso 25: `ZoomControls`, `GestureHint` y teclado de zoom

Archivos nuevos: `src/react/components/zoom-controls.tsx`, `gesture-hint.tsx`, `src/react/platform.ts`,
`src/react/zoom-controls.test.tsx`. Tocan: `core/zoom.ts`, `core/camera.ts`, `core/labels.ts`,
`map-store.ts`, `use-zoom.ts`, `Svg`, el preset, `styles.css` y `stories/zoom.stories.tsx`. Tarea 12 de
`dd.md §21`.

## 25.1 Qué se hizo

| Pieza                           | Qué es                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`<Choropleth.ZoomControls>`** | Botones `+` / `−` / `⟲`: `<button type="button">` reales con `aria-label` desde `labels`. **Opt-in**: `zoom={{ controls: true }}` o `{ position, reset }`. Esquina por defecto: abajo a la derecha.                |
| **`<Choropleth.GestureHint>`**  | El aviso «Usa Ctrl + rueda…» (⌘ en macOS e iOS) o «Usa dos dedos…». Solo sale con `wheel: "cooperative"`. 1,5 s, `aria-hidden`. El preset lo incluye.                                                              |
| **Teclado**                     | Con el `<svg>` enfocado (`tabIndex = 0`): `+` / `=` acercan, `-` / `_` alejan, `0` vuelve al encaje. Anillo de foco `--cm-focus-ring`, solo con teclado (`:focus-visible`). `zoom={{ keyboard: false }}` lo quita. |
| **`ZoomApi`** (store)           | `zoomBy(factor)` y `resetView()`: **animados y con `Promise<{ completed }>`**. Los usan los botones y el teclado, y el paso 26 los amplía a `zoomTo` y `focusId`.                                                  |

## 25.2 Cómo funciona por dentro

**Los botones, el teclado y la rueda hablan con el MISMO `d3-zoom`** (`dd.md §11.1.3`, punto 4). `use-zoom`
registra en el store una `ZoomApi` al instalarse (y `null` al desinstalarse). Un `zoomBy` es
`selection.transition().duration(300).ease(easeCubicOut)` sobre `behavior.scaleBy`; un `resetView` es
`behavior.transform(transition, identidad)` con una duración de `flightDuration` (350–1200 ms) y el
interpolador de curvatura 1,25 del paso 23. Como todo pasa por `d3-zoom`, **un gesto del usuario interrumpe
el vuelo de forma natural** (d3 llama a `interrupt` al empezar un gesto).

**`Promise` con `completed`.** `transition.end()` de d3 **rechaza** si algo interrumpe la transición. Aquí no
es un error: se convierte en `{ completed: false }`. Así `await api.zoomBy(2)` nunca lanza, y un guion de
varios vuelos (`await a; await b`) puede comprobar si el usuario lo cortó.

**Los botones se deshabilitan según la cámara confirmada** (`useMapStore(store, s => s.camera)`): `−` en
`min`, `+` en `max`, `⟲` si ya estás en el encaje (`isFitTransform`, en `core`). Se actualizan **al terminar**
el movimiento (no por frame), y como solo ellos se suscriben, **pulsar un botón no re-renderiza `Root`**
(hay test con el contador de `getId`).

**El aviso siempre está en el DOM** y se muestra con `data-visible` + CSS: así hay un fundido de salida, y el
texto no cambia mientras se apaga (se conserva el último tipo de aviso). Su temporizador vive en el store
(`showGestureHint` / `dispose`).

**⌘ o Ctrl.** `useIsApplePlatform` usa `useSyncExternalStore` con `false` en el servidor: el render del
servidor y el de la hidratación coinciden y el cliente se corrige después, sin avisos de hidratación.

## 25.3 Decisiones y desviaciones respecto a `dd.md`

| Decisión                                                                                                                | Motivo                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Los controles son opt-in** (decisión del humano); el preset los dibuja solo con `zoom={{ controls: … }}`.             | Menos ruido visual por defecto. En el compound se colocan a mano.                                                                                                              |
| **El aviso solo sale en `cooperative`** (decisión del humano). El preset incluye el componente siempre, pero invisible. | Con `"always"` (el default) no hay nada que enseñar.                                                                                                                           |
| **Ctrl, ⌘ y Alt + `+`/`−`/`0` NO se interceptan.**                                                                      | Es el zoom de la página del navegador: quitárselo al usuario sería un fallo de accesibilidad. (`dd.md` no lo dice; es lo correcto.)                                            |
| `=` cuenta como `+` y `_` como `-`.                                                                                     | Es la misma tecla física sin Shift en un teclado US; si no, `+` exigiría Shift.                                                                                                |
| **Solo `+`, `−` y `0`**; flechas, Enter, Escape, Home/End **no** están.                                                 | Son de `dd.md §13` (accesibilidad): las flechas mueven el **foco entre regiones** (navegación espacial) y `Shift` + flechas el pan. Es otro bloque de trabajo, no la tarea 12. |
| **«Reducir movimiento» = salto inmediato** por ahora (sin transición).                                                  | `dd.md §11.1.5` pide un **fundido** (opacidad a 0 en 100 ms, salto, a 1 en 150 ms); llega con los vuelos del paso 26. Hasta entonces es lo más conservador: cero movimiento.   |
| Duración de `+`/`−`: 300 ms con `easeCubicOut`; de `⟲`: la de `flightDuration`.                                         | Lo que pide `dd.md §11.1.2` y §11.1.5.                                                                                                                                         |
| Dependencias nuevas: **`d3-transition`** y **`d3-ease`** (`dependencies`) + `@types` (dev).                             | Permitidas por `dd.md §21`. `d3-transition` se importa por efecto secundario (parchea `selection.transition()`).                                                               |
| `labels` gana `zoomIn`, `zoomOut`, `resetView`, `gestureHintWheel`, `gestureHintWheelMac` y `gestureHintTouch` (en/es). | Sin texto fijo en ningún idioma. Un test comprueba que `en` y `es` tienen exactamente las mismas claves y ninguna vacía.                                                       |

⚠️ **Tab stop sobre `role="img"`.** El `<svg>` sigue con `role="img"` (R.2 #9, pendiente de `dd.md §13`) y ahora además
es enfocable cuando hay teclado. Es incoherente a ojos de un lector de pantalla; se decide con la prueba real de
VoiceOver/NVDA que pide `dd.md §13` antes de v0.5. Hasta entonces, `keyboard: false` lo deshace.

## 25.4 Tests

425 en verde (372 + 53 nuevos), `typecheck`, `lint`, `format:check`, `build` y `build-storybook` limpios; cobertura de
`core` 100 % líneas / 97 % ramas.

- **`core`:** `resolveControls` (opt-in), `zoomKeyAction` (todas las teclas, y **Ctrl/⌘/Alt no se interceptan**),
  `isFitTransform`, `createZoomInterpolator`, y que `en` y `es` tienen las mismas claves.
- **Botones:** no existen por defecto; las tres etiquetas (en/es); `reset: false`; la esquina; el estado
  deshabilitado en el encaje, en `max` y tras `⟲`; `+` acerca ×2 **centrado** (el centro sigue en el centro);
  la rueda también actualiza los botones; `onViewChange` al terminar; «reducir movimiento» = inmediato.
- **`ZoomApi`:** `completed: true` al terminar; **`completed: false` (no rechaza) cuando otro movimiento, una rueda o
  el desmontaje lo interrumpen**; se des-registra al desmontar.
- **Teclado:** tab stop, `+ = - 0`, `preventDefault` solo cuando se actúa, Ctrl/⌘ intactos, `Tab` intacto,
  `keyboard: false` y `zoom={false}`.
- **Aviso:** aparece y se apaga a los 1,5 s conservando el texto; ⌘ en macOS; «dos dedos» en táctil; `labels`; no
  aparece con `always` ni con Ctrl + rueda.
- **Rendimiento:** ni los botones ni el teclado re-renderizan `Root`.
- **Mutaciones hechas a mano (y revertidas)** para comprobar que los tests sirven. Cada una rompe tests: quitar el guard
  de Ctrl/⌘; `−` nunca deshabilitado; `⟲` nunca deshabilitado; no interrumpir al desmontar; tratar una interrupción
  como `completed: true`.

## 25.5 Verificación visual: pendiente de ti \*

`pnpm storybook` → **Zoom / Basic**:

| Story                            | Qué comprobar                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WithControlsAndKeyboard`        | Botones abajo a la derecha, **con aspecto cuidado** y sin tapar la leyenda. `−` y `⟲` apagados en el encaje; `+` acerca ×2 **con suavidad (300 ms)**; `⟲` vuela al encaje. Con teclado: tabula hasta el mapa (**anillo de foco azul**) y prueba `+`, `−`, `0`; el anillo **no** debe verse al hacer clic con el ratón. |
| `WithControlsAndKeyboard`        | `Ctrl`/`⌘` + `+` hace zoom de la **página** (no del mapa).                                                                                                                                                                                                                                                             |
| `CooperativeInAScrollablePage`   | Rueda sobre el mapa sin tecla: **la página hace scroll y aparece 1,5 s el aviso** centrado, que se desvanece. Con Ctrl/⌘ + rueda: zoom, sin aviso. En Mac el texto dice **⌘**.                                                                                                                                         |
| Móvil / DevTools táctil          | Un dedo en `cooperative`: aparece «Usa dos dedos para mover el mapa» y la página hace scroll.                                                                                                                                                                                                                          |
| Sistema con «reducir movimiento» | Los botones saltan sin animación.                                                                                                                                                                                                                                                                                      |
| Tema oscuro / `--cm-controls-*`  | Los botones usan variables CSS (`--cm-controls-bg`, `-color`, `-border`, `--cm-focus-ring`, `--cm-hint-*`): se pueden retematizar.                                                                                                                                                                                     |

## 25.6 Antes de pasar al paso 26: ¿lo tienes claro?

- ¿Por qué los botones, el teclado y la rueda deben pasar por el **mismo** `d3-zoom`?
- ¿Por qué una transición interrumpida resuelve `completed: false` en lugar de rechazar la `Promise`?
- ¿Por qué `Ctrl/⌘ + +` no se intercepta?
- ¿Por qué el aviso de gesto está siempre en el DOM y se muestra con un atributo?
- ¿Cómo se evita un aviso de hidratación al decidir entre «Ctrl» y «⌘»?

## 25.7 Decisión del humano: la accesibilidad, al final

Las flechas del teclado (mover el foco entre regiones, `Shift` + flechas para el pan) y todo lo demás de
`dd.md §13` (tabla alternativa, navegación espacial, `aria-live`, el `role="img"` del `<svg>`) **se hacen al final**,
en un bloque propio, no repartido entre las fases. Hasta entonces los atajos de teclado de zoom (`+`, `−`, `0`) son lo
único de teclado que hay.

---

# Paso 26: vuelos de cámara (`zoomTo`, `focusId`, `initialView`) y handle imperativo

Archivos nuevos: `src/react/handle.ts`, `fade.ts`, `env.ts`, `fade.test.ts`, `flights.test.tsx`,
`stories/zoom-flights.stories.tsx`, `stories/zoom-problem-countries.stories.tsx`. Tocan: `core/bounds.ts`,
`core/zoom.ts`, `use-zoom.ts`, `use-choropleth.ts`, `map-store.ts`, `Root`, el preset y
`choropleth-context.ts`. Tarea 13 de `dd.md §21`.

## 26.1 Qué se hizo

Hasta ahora la cámara solo se movía por gestos y botones. Ahora **se puede dirigir por código**, de tres formas:

| Forma                       | Cómo                                                             | Cuándo vuela                                                |
| --------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| **Imperativa** (`ref`)      | `ref.current.zoomTo("ES")`, `zoomBy`, `resetView`, `getView`     | Al llamarla; devuelve `Promise<{ completed }>`              |
| **Declarativa** (`focusId`) | `<ChoroplethMap focusId={pais} />`                               | Cuando `focusId` **cambia**; con `null` vuelve al encaje    |
| **Inicial** (`initialView`) | `zoom={{ initialView: "ES" \| { bounds } \| { center, zoom } }}` | **Nunca**: coloca la cámara al montar, sin animar ni avisar |

`ZoomTarget` (dd.md §9.5): un **id de región**, `{ bounds: [[lonO, latS], [lonE, latN]] }` o
`{ center: [lon, lat], zoom }` (zoom **relativo al encaje**, 1 = encaje). `useChoroplethApi()` da el mismo handle
**dentro del compound**, para que un botón hijo vuele sin necesitar un `ref`.

## 26.2 Cómo funciona por dentro

```
 ZoomTarget ──► resolveZoomTarget (core, pura) ──► CameraTransform ──► constrain ──► animate ──► d3-zoom
   "ES"          región → límites en px              k, x, y            (contain)     vuelo       (el MISMO
   {bounds}      lon/lat → projectBounds                                              o fundido    behavior)
   {center,zoom} center → proyección
```

- **`resolveZoomTarget`** es pura: la proyección y la geometría llegan como funciones. Aplica `scaleExtent`
  (`boundsToTransform` del paso 23) y devuelve `null` si no puede resolver (región inexistente).
- **`constrain` se aplica aquí, a mano.** `d3-zoom` solo aplica `constrain` a los **gestos**, no a las transiciones
  programáticas: sin esto, volar a un país en el borde del mapa dejaría la cámara fuera de los límites.
- **Un solo `behavior`.** Los vuelos pasan por el mismo `d3-zoom` que los gestos (`dd.md §11.1.3`, punto 4): d3 siempre
  conoce la cámara real y **un gesto interrumpe el vuelo** (la `Promise` resuelve `completed: false`).
- **Duración:** la natural de `interpolateZoom` × `speed`, acotada a [350, 1200] ms (`flightDuration`, paso 23), con
  `easeCubicInOut` para vuelos y `easeCubicOut` para `+`/`−`. `duration: 0` = «colócala ya» (ni vuelo ni fundido).
- **`focusId`** es un efecto real (mueve la cámara) en `use-zoom`, **después** del que instala `d3-zoom` (en un mismo
  componente los efectos corren en orden, y aquí hace falta la API ya registrada). El primer valor se coloca con
  `{ duration: 0, silent: true }` (sin volar y **sin avisar a `onViewChange`**); los cambios posteriores vuelan.
- **Reduced-motion = fundido** (`fade.ts`, Web Animations API nativa): opacidad del viewport a 0 en 100 ms, **salto de
  cámara**, opacidad a 1 en 150 ms (`dd.md §11.1.5`). «Se quita el movimiento, no la continuidad». Sin `Element.animate`
  (jsdom) salta directamente. Un movimiento nuevo **cancela** el fundido anterior. Sustituye al «salto inmediato»
  provisional del paso 25, que ahora también aplica a `+`/`−`.

## 26.3 Encuadre: el cuerpo principal, no la geometría entera

`zoomTo("FR")` encuadra `getFocusGeometry` (paso 20): Francia sin la Guayana, EE. UU. sin Alaska/Hawái, Noruega sin
Svalbard. Dos casos necesitaron más:

**España incluye Canarias** (decisión del humano). `DEFAULT_FOCUS_BOUNDS = { ES: [[-18.5, 27.5], [4.5, 44]] }`
(el ejemplo de `dd.md §11.1.5`), porque «para Inditex, Canarias es un caso de negocio, no un detalle geométrico». Se
fusiona con la prop **`focusBounds`** del consumidor; `focusBounds={{ ES: null }}` vuelve al encuadre de la península.

**Antimeridiano: un fallo real que descubrieron los tests con geodatos reales.** El polígono principal de **Rusia**
cruza la línea ±180° **sin partirse**, y `path.bounds` mide las dos mitades: el encuadre salía de borde a borde con
Chukotka asomando por el lado contrario (su centro caía en lon ≈ 2°, en lugar de ≈ 100°). Es justo el problema que
`dd.md` anuncia de Rusia. Solución (`getFocusExtent`, `core/bounds.ts`): detectar el cruce con `geoBounds` (devuelve
`oeste > este`) y **encuadrar la mitad más ancha** con `projectBounds`. La misma regla se aplica a los límites
explícitos que cruzan el antimeridiano: en un mapa plano **no existe un rectángulo que contenga las dos mitades**
(sale un caja del ancho del mundo), igual que `getFocusGeometry` se queda con el cuerpo principal.

## 26.4 Decisiones y desviaciones respecto a `dd.md`

| Decisión                                                                                                            | Motivo                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`forwardRef`** (no `ref` como prop) en `Root` y en el preset.                                                     | `dd.md §9.5` dice «prop en React 19; `forwardRef` en 18». La librería declara `react >=18`, así que `forwardRef` funciona en las dos. El tipo se re-expone con el genérico y `ref?: Ref<ChoroplethMapHandle>`.               |
| El handle **solo tiene** `zoomTo`, `zoomBy`, `resetView` y `getView`.                                               | `drillDown`/`drillUp` llegan en la fase C y `toSVGString`/`toPNG` con la exportación (v0.6). Prometerlos antes sería declarar lo que no existe.                                                                              |
| Con `zoom={false}` los movimientos resuelven `{ completed: false }` y `getView` devuelve el encaje; **no lanzan**.  | Un mapa estático con un `ref` no debe romper al consumidor que llama a `zoomTo`. La vista de reserva se registra en el store desde un efecto de `Root` (no con una `ref` leída en el render: el linter lo impide con razón). |
| `getView()` lee `zoomTransform(svg)`, la cámara **real**, no la confirmada.                                         | También es correcta a mitad de un vuelo.                                                                                                                                                                                     |
| Una región inexistente: `completed: false` + aviso de consola en inglés (solo fuera de producción).                 | Un id mal escrito debe explicarse solo (principio de DX de `dd.md`), sin lanzar.                                                                                                                                             |
| `initialView` solo cuenta **al montar**; `focusId` manda sobre él; cambiarlo después no mueve la cámara.            | Es una vista inicial, no un estado controlado. Para eso está `focusId`.                                                                                                                                                      |
| `ZoomOptions` gana `padding` (por defecto 24) e `initialView`. `focusId` y `focusBounds` son props de primer nivel. | Siguen `dd.md §9.2` y §11.1.1.                                                                                                                                                                                               |
| `silent` existe en `ZoomApi.zoomTo` pero **no** en el handle público ni en `CameraOptions`.                         | Es un detalle interno (colocar sin avisar); solo tiene sentido con `duration: 0`.                                                                                                                                            |

## 26.5 Tests

489 en verde (425 + 64 nuevos), `typecheck`, `lint`, `format:check`, `build` y `build-storybook` limpios; cobertura de
`src/core` 100 % líneas / 97,6 % ramas.

- **`core`:** `resolveZoomTarget` (región, `focusBounds`, `{ null }`, microestado, `{ bounds }`, `{ center, zoom }`, límites
  de `k`, entradas inválidas), `projectBounds` (esquinas, paralelos curvos, **antimeridiano**), `getFocusExtent`
  (incluido un anillo tipo Rusia), `DEFAULT_FOCUS_BOUNDS` (España incluye Canarias).
- **Handle:** `zoomTo` a región, a otra región, `{ center, zoom }`, `{ bounds }`; `duration: 0` instantáneo; región inexistente;
  **`constrain: contain` respetado en el destino**; `padding`; **interrupción por rueda**; `onViewChange` una vez por vuelo;
  `zoom={false}`; `zoomBy`/`resetView`; **encadenar con `await`**; `useChoroplethApi`; `ref` también en el preset.
- **`focusId` e `initialView`:** colocación inicial **sin volar ni avisar**; vuelo al cambiar; `null` vuelve al encaje; el
  mismo valor no vuela otra vez; id inexistente; geografía asíncrona; `focusId` sobre `initialView`.
- **Reduced-motion:** el orden exacto fundido-salida → **salto** → fundido-entrada; la cámara no se mueve hasta el salto;
  un movimiento nuevo cancela el anterior; `duration: 0` sigue siendo instantáneo; desmontar cancela.
- **Encuadres con geodatos reales (`world110m`):** **Francia** sin Guayana, **EE. UU.** sin Alaska, **España con
  Canarias**, `{ ES: null }` y `focusBounds` propio, **Fiyi**, **Rusia**.
- **Mutaciones hechas a mano y revertidas** (cada una rompe tests): quitar el tratamiento del antimeridiano (rompe el test
  de `core` **y** el de Rusia con datos reales); España sin Canarias por defecto; no aplicar `constrain` al destino; avisar
  a `onViewChange` en la colocación inicial; no cancelar el fundido anterior; volar aunque `focusId` no cambie; no
  liberar el `fill: forwards` del fundido.

Dos trampas, ambas de mis tests y documentadas en ellos: (1) el fixture `twoSquares` tiene el anillo en sentido
antihorario, así que d3 lo lee como «el globo menos el cuadrado» y su mapa es el mundo entero (`invert(centro) = [0, 0]`
era correcto): los tests de encuadre usan dos bloques propios con el sentido horario; (2) al re-renderizar un `Root`
**sin** pasarle el `ref`, React desengancha el handle (correcto).

## 26.6 Verificación visual: pendiente de ti \*

`pnpm storybook` → **Zoom / FocusAndFlights** y **Zoom / ProblemCountries**:

| Story                                          | Qué comprobar                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FocusAndFlights · Declarative`                | Elige un país: la cámara **vuela** (se aleja, viaja, se acerca) **sin saltos ni parpadeos** y con suavidad. Un viaje largo (España → Fiyi) debe leerse; uno corto, ser rápido. «(mundo entero)» vuelve al encaje.                                           |
| `FocusAndFlights · ImperativeAndTour`          | «▶ Tour» encadena los 9 países con `await`. **Agarra el mapa a mitad**: el vuelo se corta y el tour se detiene («tour interrumpido en …»). «■ Parar» también.                                                                                               |
| `ProblemCountries · Default`                   | Cada botón enmarca el **cuerpo principal**: **Francia** sin la Guayana, **EE. UU.** sin Alaska, **Rusia** sin Chukotka asomando por la izquierda, **Fiyi** una isla (no medio mundo), **España CON Canarias**. Las burbujas deben caer **dentro** del país. |
| `ProblemCountries · SpainWithoutCanaryIslands` | España enmarca solo la península.                                                                                                                                                                                                                           |
| Sistema con «reducir movimiento»               | Los vuelos y los botones **no se mueven**: hacen un fundido corto (a 0, salto, a 1). Nunca un corte seco.                                                                                                                                                   |
| Cualquiera                                     | Con `controls` activos, `−` y `⟲` se habilitan al terminar el vuelo.                                                                                                                                                                                        |

## 26.7 Antes de pasar al paso 27: ¿lo tienes claro?

- ¿Por qué `zoomTo` aplica `constrain` a mano si `d3-zoom` ya lo tiene?
- ¿Por qué `focusId` coloca la cámara sin volar en el primer render, y por qué sin avisar a `onViewChange`?
- ¿Qué problema tiene Rusia con `path.bounds`, y cómo lo detecta `getFocusExtent`?
- ¿Por qué el reduced-motion es un **fundido** y no un salto sin más?
- ¿Por qué `forwardRef` y no `ref` como prop?
- ¿Por qué el fixture `twoSquares` «funcionaba» en tests de render pero no en los de encuadre?

## 26.8 Pregunta abierta

`getAnchorPoint` (el ancla de las burbujas, paso 20) proyecta los vértices del polígono principal uno a uno. Para Rusia, cuyo
anillo cruza el antimeridiano, ese anillo proyectado tiene un salto de borde a borde. Visualmente la burbuja de Rusia salió
plausible en la comprobación del paso 22, pero **no está garantizado**. ¿Lo reviso con una prueba específica (ancla de Rusia
dentro de su cuerpo principal) antes de seguir, o lo dejamos para el pulido?

# Paso 27: contraescalado de burbujas, inercia y resize sin salto

Archivos nuevos: `src/react/camera-feel.test.tsx`, `stories/zoom-feel.stories.tsx`. Tocan: `core/camera.ts`,
`core/zoom.ts`, `use-zoom.ts`, `components/svg.tsx`, `styles.css`. Tarea 14 de `dd.md §21`. **Sin commitear.**

## 27.1 Qué se hizo

| Pieza                | Comportamiento                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contraescalado**   | `zoom.bubbleScaling: "sqrt" (default) \| "screen" \| "geo"`. `use-zoom` escribe UNA variable por frame, `--cm-bubble-scale` (`1/√k`, `1/k` o `1`); el CSS de `.cm-bubble` aplica `scale()` con `transform-box: fill-box`. |
| **Inercia**          | Al soltar un arrastre: velocidad de las muestras de ≤ 100 ms; si ≥ 0,3 px/ms, `inertiaOffset` con τ = 325 ms hasta agotarse. `zoom.inertia` (default `true`).                                                             |
| **Resize sin salto** | Al cambiar el tamaño se guarda la cámara real y el `invert` del lienzo viejo; al reinstalar, `preserveView` (centro geográfico + `k`) y `constrain`.                                                                      |

`core` nuevo (puro, con tests): `bubbleScale`, `releaseVelocity`, constantes `INERTIA_MIN_VELOCITY` / `INERTIA_WINDOW_MS`.

## 27.2 Decisiones

- **La inercia anima con `requestAnimationFrame`, no con una transición de d3.** `interpolateZoom` entre dos vistas del
  mismo ancho **hace un arco alejándose** (zoom-out): una inercia de pan no puede pasar por ahí. Cada frame llama a
  `behavior.transform` con una cámara absoluta; `onViewChange` y el store se tocan **una vez**, al terminar.
- **`behavior.transform` no aplica `constrain`** (solo gestos, `scaleBy`, `translateBy`): la inercia lo aplica a mano
  (un test lo cazó: sin él la cámara llegaba a x = −3466). Se detiene al chocar con un límite.
- **Se frena con** `pointerdown`, con el `start` de cualquier gesto del usuario y con cualquier movimiento programático
  (`zoomTo`, botones). Al frenarla se confirma la cámara y se avisa a `onViewChange`.
- **Sin inercia con «reducir movimiento»**, con zoom (la `k` cambia en la ventana), si la mano se paró antes de soltar o
  si la velocidad no llega al umbral. Mientras desliza hay `data-interacting` (sin hover).
- **Resize:** no avisa a `onViewChange` (como cualquier restauración). `bubbleScaling` e `inertia` son primitivas en las
  dependencias del efecto (cambiarlas reinstala, y la variable se recalcula con la cámara actual).
- **Desviación:** las burbujas llevan `vector-effect: non-scaling-stroke` para que el trazo de 0,5 px no se afine con el
  contraescalado (no está en `dd.md`; reversible).
- `bubbleScaling` e `inertia` viven en `ZoomOptions` (`dd.md` no fija dónde va el primero).

## 27.3 Tests

519 en verde (489 + 30 nuevos); `typecheck`, `lint`, `format:check`, `build` limpios; cobertura de `src/core` 100 % líneas.
Mutaciones a mano revertidas (cada una rompe tests): sin `preserveView`; inercia sin `constrain`; `pointerdown` sin frenar;
sin escribir `--cm-bubble-scale`; sin umbral/ventana de velocidad; sin frenar en `start`.

## 27.4 Verificación visual: confirmada por el humano

`pnpm storybook` → **Zoom / BubblesAndInertia** (`Sqrt`, `Screen`, `Geo`, `NoInertia`):

| Qué comprobar                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- |
| Acercar con la rueda: `Sqrt` crece despacio, `Screen` no cambia de tamaño, `Geo` crece con el mapa. Sin parpadeos ni saltos al hacer zoom.  |
| Con zoom, arrastra **rápido** y suelta: desliza y frena suave (~1 s). Agárralo a mitad: se para al instante. Arrastra despacio: no desliza. |
| `NoInertia`: al soltar se para en seco.                                                                                                     |
| **Resize:** con zoom aplicado, cambia el ancho de la ventana: la vista **no vuelve al encaje** ni se desplaza (mismo centro y zoom).        |
| Las burbujas siguen sobre su país y el trazo blanco se mantiene fino.                                                                       |

## 27.5 Antes de pasar al paso 28: ¿lo tienes claro?

- ¿Por qué la inercia no usa una transición de d3-zoom?
- ¿Por qué hay que aplicar `constrain` a mano en `behavior.transform`?
- ¿Qué se conserva en un resize, y por qué hace falta el `invert` del lienzo **antiguo**?
- ¿Por qué `1/√k` y no `1/k` por defecto?

# Paso 28: la máquina de estados del drill-down (`core/drill.ts`)

Archivos nuevos: `src/core/drill.ts`, `src/core/drill.test.ts`; `core/index.ts` exporta. Tarea 15 de `dd.md §21`. Sin React, sin DOM y
**sin efecto visual** (nada que abrir en Storybook). **Sin commitear.**

## 28.1 Qué se hizo

`drillReducer(state, event)` es la coreografía de `dd.md §11.2.3` convertida en una función pura. Quien la use (paso 31) traduce el
mundo real a eventos y pinta el estado; aquí solo se decide **qué pasa después de qué**.

```
 idle ──DRILL(down|lateral)──► flying ──FLIGHT_END ok + geometría lista──► revealing ──REVEAL_END──► idle
                                 │  └── geometría pendiente ──► loading ──GEOMETRY_READY──► revealing
 idle ──DRILL(up)────────────► flying(up) ──FLIGHT_END──► idle        (todo ya dibujado: solo falta la cámara)
 idle ──DRILL(jump)──────────► idle (en caché)  |  loading ──GEOMETRY_READY──► idle      (sin animación)
 error de geometría ──► (al acabar el vuelo / ya) flying(up) de vuelta a `returnCamera` ──► idle, con `error` puesto
```

Exporta además `createDrillState(path)`, `classifyDrill(from, to)`, `layerKey` y `savedCameraFor`.

## 28.2 Modelo: capas

La capa de profundidad `d` muestra los hijos de `path[0..d)`. En `["ES"]` hay dos: el mundo (`context`) y las regiones de España
(`active`). Cada transición es «de estas capas a estas otras»; `layersFor` calcula el reparto de roles:

| Transición    | Capas                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| bajar         | durante el vuelo no cambia nada; al revelar, el padre pasa a `context` y el hijo `entering` |
| lateral ES→FR | el mundo sigue de contexto; las regiones de ES `exiting`, las de FR `entering`              |
| subir         | **al instante**: la hija `exiting`, el contexto `active`; solo queda el vuelo de cámara     |
| salto         | estado final directo, sin `entering` ni `exiting`                                           |

`layerKey` es el JSON del prefijo del path (no `join("/")`): un id con `/` o `.` no puede colisionar con otra ruta.

## 28.3 Decisiones (y qué añade respecto al esquema de `dd.md`)

- **`path` ≠ `settledPath`.** `path` es el destino optimista (cambia en el clic); `settledPath` es lo dibujado como activo. Sin
  esta distinción no se puede deshacer una bajada ni saber cuál es el «origen» de una redirección.
- **`flightId`.** Un vuelo redirigido se resuelve con `completed: false` **después** de que ya haya empezado el siguiente. Sin un id,
  ese `FLIGHT_END` viejo cancelaría la bajada nueva. Cada `DRILL` incrementa el id; el `FLIGHT_END` de otro id se ignora. Igual con
  `geometryKey` para los avisos de geometría de un destino ya abandonado.
- **La dirección se deduce, no se confía.** `DRILL.direction` solo se respeta si es `"jump"`; el resto sale de `classifyDrill(settledPath, to)`.
  `down` = un nivel más; `up` = un ancestro (cualquier nº de pasos); `lateral` = cambia solo el último id; **cualquier otra cosa es `jump`**
  (p. ej. bajar dos niveles de golpe: no hay un vuelo único que lo cuente bien).
- **Cámaras.** `DRILL.camera` es la cámara en el instante del clic. Se guarda en `savedCameras[origen]` **solo al bajar desde reposo**
  (una redirección a mitad de vuelo traería una cámara intermedia que pisaría la buena) y se **poda** al subir. `returnCamera` es adonde
  se vuelve si la bajada falla o se cancela. El lateral no guarda: la cámara de «antes de bajar a España» sigue siendo la válida.
- **Un gesto que corta el vuelo de bajada cancela la bajada** (no hay vuelo de vuelta: el usuario ya tiene el mapa en la mano). Cortar una
  **subida** no deshace nada, porque ya estaba dibujada.
- **Fallo de geometría:** si ocurre volando, se espera al fin del vuelo y se vuela de vuelta; si ocurre cargando, la vuelta es inmediata.
  `state.error` conserva la `key` fallida hasta el siguiente `DRILL` (de ahí saldrán `onDrillError` y la sacudida). Un nivel con 0 features
  se tratará igual: la capa de React emitirá `GEOMETRY_ERROR`.
- **Clic repetido sobre el destino en curso: no hace nada.** Lo descubrí al revisar: reiniciaba `geometry` a `pending` aunque ya hubiera
  llegado, y nunca volvería a avisar. Volver al origen mientras se baja (`equal`) sí es una cancelación con vuelo de vuelta.
- **Clic durante el revelado:** se asienta lo que había y empieza la siguiente bajada.

## 28.4 Tests

567 en verde (519 + 48 nuevos); `typecheck`, `lint`, `format:check` limpios; `drill.ts` 100 % líneas, 99 % ramas.
Cubren: clasificación (10 casos), identidad de capas, montaje con ruta, bajar paso a paso (con y sin caché), redirección en vuelo y
cargando, clic durante el revelado, cancelar (gesto y «subir antes de terminar de bajar»), subir (1 y N niveles, cámaras podadas),
lateral, saltos (con y sin caché, con error), errores de geometría (volando, cargando, obsoletos) y eventos fuera de lugar.

Mutaciones a mano revertidas (cada una rompe tests): no ignorar el `FLIGHT_END` viejo; no ignorar la geometría vieja; no guardar la cámara;
el gesto no cancela; el error no deshace; no podar cámaras; la redirección pisa `returnCamera`; quitar la guarda del clic repetido.

## 28.5 Verificación visual

No aplica: no hay efecto visible hasta el paso 31 (capas `active`/`context`).

## 28.6 Antes de pasar al paso 29: ¿lo tienes claro?

- ¿Por qué `path` y `settledPath` son dos cosas distintas?
- ¿Qué fallaría sin `flightId`? Pon un ejemplo con dos clics seguidos.
- ¿Por qué al subir las capas cambian al instante y al bajar no?
- ¿Por qué bajar dos niveles de golpe es un `jump` y no un `down`?
- ¿Por qué la cámara se guarda solo al bajar desde reposo?
