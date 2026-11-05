# Choropleth Kit: proceso de construcción, paso a paso

> **Para qué sirve este documento.** Es el diario didáctico del proyecto. Cada paso explica **qué se
> hizo, por qué y cómo comprobar que funciona**. Está escrito para una persona que sabe crear
> aplicaciones React pero no librerías, y para cualquier agente que retome el trabajo sin contexto.
>
> **Documento de diseño de referencia:** `../dd.md` (briefing con la definición de la librería).
> Aquí no se repite el diseño, solo se explica cómo se va construyendo.
>
> **Regla de trabajo:** un paso cada vez, acotado y verificable. No se empieza el siguiente hasta que
> quien aprende confirma que entiende el actual.

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
| 9     | React nivel 2: compound (`Choropleth.Root` + piezas)             | ⏳ Pendiente                                           |
| 10    | React nivel 1: preset `<ChoroplethMap>`                          | ⏳ Pendiente                                           |
| …     | (siguientes tareas del §20 de `dd.md`)                           | ⏳ Pendiente                                           |

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
`storybook-static`. (El repositorio git aún **no está inicializado**: ver §1.7.)

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
2. **¿Inicializamos git?** El proyecto aún no es un repositorio. Es un comando (`git init`), pero te lo
   dejo a ti para no tomar la decisión por ti.
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

Mide un elemento con `ResizeObserver` y devuelve `{ ref, width, height }`. Es el **único `useEffect`** de la
librería (observar el DOM es un efecto real; lo demás se deriva al renderizar).

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

## Siguiente paso (propuesta, no iniciado)

**Paso 9: nivel 2, compound.** `Choropleth.Root` (llama a `useChoropleth` y lo pone en un Context) y los
componentes `Regions`, `Borders`, `Legend` (HTML, con render prop para leyenda headless) y `Tooltip`
(posicionado junto al cursor, contenido por render prop). **Paso 10:** `<ChoroplethMap>` = Root + piezas por
defecto, con la unión discriminada de props de `dd.md §9.2`. Después el diagnóstico en consola (paso 11) y la story
final.
