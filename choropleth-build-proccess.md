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

| Paso  | Título                                                        | Estado        |
| ----- | ------------------------------------------------------------- | ------------- |
| **1** | **Scaffolding: proyecto, bundler, tests y Storybook**         | ✅ Hecho      |
| 2     | Primer código real: `core/geography.ts` (TopoJSON → GeoJSON)  | ⏳ Pendiente  |
| …     | (siguientes tareas del §20 de `dd.md`)                        | ⏳ Pendiente  |

---

# Paso 1: Scaffolding

## 1.1 Qué es una librería y en qué se diferencia de una aplicación

Si vienes de crear aplicaciones, lo único que cambia es **quién ejecuta tu código y cómo llega a él**.

|                      | Aplicación                                   | Librería                                                      |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Resultado del build  | Una web que se despliega (HTML + JS)         | Archivos JS + tipos (`.d.ts`) que **otros proyectos importan** |
| Quién la "arranca"   | El navegador                                 | Otro proyecto, con `import { ... } from "choropleth-kit"`     |
| Punto de entrada     | `index.html` + `main.tsx`                    | Un `index.ts` que **exporta** cosas                           |
| React                | Es una dependencia más                       | Es una **peerDependency**: la pone el consumidor, no nosotros |
| Dependencias         | Todas se empaquetan                          | Solo las propias (`d3-geo`…); React **no** se empaqueta       |
| ¿Cómo la pruebo?     | Ejecutando la app                            | Con **tests** y con un entorno aislado (**Storybook**)        |

Consecuencia práctica: una librería necesita **tres cosas que una app no necesita**:

1. **Un bundler de librerías** que convierta nuestro TypeScript en JS publicable y genere los tipos.
2. **Un `package.json` con `exports`** que diga qué se puede importar desde fuera.
3. **Un sitio donde verla funcionar** sin tener una app detrás: Storybook.

## 1.2 Las herramientas elegidas y por qué

| Herramienta                    | Rol                                                     | Por qué esta y no otra                                                                                                   |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **TypeScript**                 | Lenguaje y comprobación de tipos                        | Los tipos genéricos (`TDatum`) son parte clave de la API (§9.2 de `dd.md`).                                              |
| **tsup**                       | **Bundler**: TS → JS + `.d.ts`                          | Una sola config de pocas líneas. Es una de las dos opciones que propone `dd.md` (la otra es Vite library mode).          |
| **Vitest**                     | Ejecutor de **tests unitarios**                         | Misma sintaxis que Jest, pero entiende TypeScript y ESM sin configuración extra (importante: d3 v7 es solo ESM).         |
| **jsdom**                      | Un "navegador falso" dentro de Node                     | Permite renderizar componentes React en los tests sin abrir un navegador.                                                |
| **React Testing Library**      | Utilidades para testear componentes                     | Prueba lo que ve el usuario (texto, roles), no detalles internos.                                                        |
| **Storybook** (`react-vite`)   | **Sandbox** para ver y probar componentes aislados      | Es nuestra "app de pruebas". Cada _story_ es un ejemplo del componente. También servirá de documentación.               |
| **Vite**                       | Servidor de desarrollo de Storybook                     | Lo usa Storybook por debajo. No lo usamos para el build de la librería (eso lo hace tsup).                               |

> **Dos "builds" distintos, no te líes.**
> `npm run build` → **tsup** → genera `dist/`, que es **lo que se publicaría**.
> `npm run build-storybook` → **Vite** → genera `storybook-static/`, una web de demos que **no se publica en npm**.

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

| Archivo                          | Qué es                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| `src/core/placeholder.ts`        | Una función pura que devuelve el nombre de la librería         |
| `src/core/placeholder.test.ts`   | Su test unitario (entorno Node/jsdom)                          |
| `src/react/placeholder.tsx`      | Un componente que **importa de `core`** y lo pinta             |
| `src/react/placeholder.test.tsx` | Su test con React Testing Library                              |
| `stories/placeholder.stories.tsx`| Su _story_ en Storybook                                        |

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

  | El consumidor escribe                        | Recibe             |
  | -------------------------------------------- | ------------------ |
  | `import … from "choropleth-kit"`             | `dist/index.js`    |
  | `import … from "choropleth-kit/core"`        | `dist/core.js`     |
  | `import … from "choropleth-kit/src/lo-que-sea"` | ❌ **error**: no está exportado |

  Es una forma de **definir la API pública**: lo que no está en `exports` no se puede importar, así que
  podemos reorganizar el interior sin romper a nadie. `"types"` va **primero** porque TypeScript lee
  las condiciones en orden y se queda con la primera que le sirve.

- **`main` y `types`** (en la raíz) son un respaldo para herramientas antiguas que no entienden `exports`.

**Scripts:**

| Comando                 | Qué hace                                                                        |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run build`         | Compila la librería a `dist/` (tsup)                                            |
| `npm run dev`           | Igual, pero recompila al guardar                                                |
| `npm run typecheck`     | Comprueba los tipos sin generar nada (`tsc --noEmit`)                           |
| `npm test`              | Ejecuta todos los tests una vez                                                 |
| `npm run test:watch`    | Tests en modo vigilancia: se repiten al guardar                                 |
| `npm run test:coverage` | Tests + informe de cobertura (falla si `src/core` baja del 90 %)                |
| `npm run storybook`     | Arranca Storybook en http://localhost:6006                                      |
| `npm run build-storybook` | Genera Storybook como web estática (sirve para comprobar que compila)         |

### `tsconfig.json`: reglas de TypeScript

Un punto clave: **TypeScript aquí solo comprueba tipos** (`"noEmit": true`). No genera JS; eso lo hace
tsup. Por eso se ejecuta con `npm run typecheck`.

| Opción                                  | Para qué sirve                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `"strict": true`                        | Todas las comprobaciones estrictas (obligatorio según `dd.md`).                                                             |
| `"noUncheckedIndexedAccess": true`      | `array[0]` pasa a tener tipo `T \| undefined`. Evita muchos errores con listas y mapas. Añadido por nosotros (extra a `dd.md`). |
| `"moduleResolution": "Bundler"`         | Cómo resuelve TypeScript los `import`: como lo hacen los bundlers modernos (sin exigir extensión `.js`).                    |
| `"jsx": "react-jsx"`                    | Transformación moderna de JSX: no hay que escribir `import React` en cada archivo.                                          |
| `"isolatedModules": true`               | Cada archivo debe poder compilarse por separado (lo exigen tsup, Vite y Vitest, que transforman archivo a archivo).        |
| `"verbatimModuleSyntax": true`          | Obliga a escribir `import type { … }` cuando solo se importan tipos. Evita imports muertos en el JS final.                  |
| `"skipLibCheck": true`                  | No revisa los `.d.ts` de `node_modules`. Más rápido y evita errores ajenos.                                                 |
| `"types": ["node", "vitest/globals", "@testing-library/jest-dom"]` | Qué tipos globales hay disponibles: `describe/it/expect` sin importarlos, y matchers como `toBeInTheDocument()`. |
| `"include": [...]`                      | Qué carpetas revisa: `src`, `tests`, `stories`, `.storybook` y los `*.config.ts` de la raíz.                                |

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
  - **`thresholds` 90 %**: si baja, `npm run test:coverage` **falla**. Es el criterio de aceptación
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

| Comando                   | Resultado esperado                                                        |
| ------------------------- | ------------------------------------------------------------------------- |
| `npm run typecheck`       | Sin salida (silencio = correcto)                                          |
| `npm test`                | `2 passed`                                                                |
| `npm run test:coverage`   | 100 % en `core` (hay un solo archivo)                                     |
| `npm run build`           | Crea `dist/` con `index.js`, `core.js`, sus `.d.ts` y sourcemaps          |
| `npm run storybook`       | Abre http://localhost:6006; en la barra lateral: **Setup → Placeholder**  |

Prueba extra que merece la pena entender: la librería **se puede importar como lo haría un consumidor**.

```bash
node -e "import('./dist/core.js').then(m => console.log(m.describeLibrary()))"
# → choropleth-kit
```

**Experimentos recomendados** (rompe algo a propósito para ver cómo reacciona cada herramienta):

1. En `src/core/placeholder.ts`, cambia el texto devuelto → `npm test` falla y te dice qué esperaba.
2. Pon `const x: number = "hola"` en cualquier archivo → `npm run typecheck` falla.
3. En `placeholder.tsx`, cambia el texto con Storybook abierto → se actualiza solo en el navegador.

## 1.6 Decisiones y problemas encontrados

Cosas que **no están en `dd.md`** o que se desviaron de él, y por qué:

| Decisión                                              | Motivo                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript fijado en `~5.9.3`, no la 7.x**          | La 7 (compilador nativo) **no incluye la API JavaScript** que tsup necesita para generar `.d.ts`: el build fallaba. `~` permite parches 5.9.x pero no saltar a la 6. Revisar cuando tsup lo soporte. |
| **`jsdom` en la 27, no la 30**                        | La 30 exige Node 22.22+/24.15+/26+. Tu Node es **23.5** (una versión "impar", sin soporte a largo plazo) y fallaba al arrancar.                          |
| **Instalación con `--legacy-peer-deps`** (en algunos paquetes) | El resolutor de npm tiene un bug (`Cannot read properties of null (reading 'edgesOut')`) al instalar `vitest@5` con esta combinación. El flag no cambia las versiones resultantes, solo se salta la comprobación de peers del resolutor. |
| **Solo formato ESM**                                  | `dd.md §20` pide ESM + `.d.ts`. d3 v7 ya es solo ESM, así que ofrecer CJS apenas ayuda.                                                                  |
| **Storybook en lugar de `playground/`**               | Petición tuya. Cumple el mismo papel (ver la librería con datos sintéticos) y además sirve de documentación.                                              |
| **`noUncheckedIndexedAccess` activado**               | Extra de seguridad respecto a `dd.md`. Si resulta incómodo, se desactiva en `tsconfig.json`.                                                              |
| **Nombre `choropleth-kit` y licencia MIT**            | **Provisionales.** Comprobado que `choropleth-kit` no existe en npm, pero `dd.md §20` dice que el nombre, el scope y la licencia los decide una persona. |
| **Sin ESLint/Prettier todavía**                       | No se pidió; añadirlos ahora sería otro paso más que explicar. Candidato para un paso posterior.                                                          |
| **Sin `size-limit` ni Changesets todavía**            | Son de la fase v1.0 en el roadmap (§17). No tiene sentido medir el peso de una librería vacía.                                                            |

**Avisos de seguridad de `npm audit`:** quedan 5 de severidad baja/moderada, todas en herramientas de
desarrollo de Storybook y del bundler (`esbuild`, `glob`, `minimatch`). **No se distribuyen con la
librería** (`files` solo incluye `dist`), así que no afectan a quien la use. Se revisarán al actualizar
Storybook. No ejecutar `npm audit fix --force`: puede romper versiones.

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
- ¿Qué diferencia hay entre `npm run build` y `npm run build-storybook`?
- ¿Para qué sirve `exports` y qué pasaría si un consumidor intentara importar `choropleth-kit/src/core`?
- ¿Por qué `core` no puede importar React?
- ¿Por qué los tests están al lado del código y no en una carpeta aparte?

---

## Siguiente paso (propuesta, no iniciado)

**Paso 2: primer código real (`core/geography.ts`).** Aprenderemos qué es TopoJSON en la práctica:
instalar `topojson-client` y `d3-geo`, escribir `toFeatureCollection` (acepta TopoJSON o GeoJSON y
devuelve siempre GeoJSON), testearla con un TopoJSON mínimo escrito a mano y borrar el código
provisional. Es la primera función real de la librería y marca el patrón (función pura + test) que se
repetirá en todo `core`.
