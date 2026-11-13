# Publicar choropleth-kit en npm y llevar el versionado en GitHub

> Guía en español para el mantenedor (la versión en inglés, más breve, es [`PUBLISHING.md`](./PUBLISHING.md)).
> **Nada de esto se ejecuta solo y ningún agente lo hace por ti:** publicar en npm, crear tags y crear releases
> son decisiones tuyas. Un agente puede preparar y comprobar, pero no ejecuta esos pasos sin que se lo pidas
> de forma explícita para esa acción concreta.

## 1. ¿Está lista la librería?

Técnicamente sí: `pnpm verify` y `pnpm smoke:package` pasan (con React 18 y 19), el paquete instalado con npm
renderiza un mapa y sus tipos compilan, y el nombre `choropleth-kit` está libre en npm.

Lo que decide si es buen momento **no es técnico**, y lo confirmas tú antes del paso 3:

- [ ] Has decidido que puedes publicarla con tu nombre y licencia MIT (ISSUE-011).
- [ ] Has revisado las stories que promociona el README (ISSUE-007, hecho el 2026-11-11).
- [ ] La PR de documentación (README con imagen, ISSUE-005 cerrado) está mergeada en `develop`.
- [ ] Has activado las protecciones de `master` (ver el apartado 5).

## 2. Una sola vez: preparar tu cuenta de npm

1. Crea la cuenta en <https://www.npmjs.com/signup> y verifica el correo.
2. Activa la verificación en dos pasos en _Account → Two-Factor Authentication_, con el modo
   **Authorization and publishing**. npm te pedirá un código de un solo uso en cada publicación.
3. Inicia sesión desde la terminal: `npm login` (se abre el navegador) y comprueba con `npm whoami`.
4. Comprueba que el nombre sigue libre: `npm view choropleth-kit` debe responder `404 Not Found`.
   El nombre es tuyo en cuanto publiques, así que no esperes demasiado.

## 3. Publicar la versión 0.1.0, paso a paso

La versión de `package.json` ya es `0.1.0`: **no hay que subirla**. Todos los comandos se ejecutan en tu
terminal, en la raíz del proyecto.

**3.1. Lleva `develop` a `master` con una PR de release.**
Abre en GitHub una PR de `develop` hacia `master`, con el título `chore: release v0.1.0` (el check `pr-title`
exige Conventional Commits). Cuando los checks estén en verde, mergéala con **«Create a merge commit»**. No uses
squash: con squash, `master` recibe un commit que `develop` no tiene y las dos ramas empiezan a divergir.

**3.2. Sincroniza tu copia local con `master`.**

```bash
git switch master
git pull --ff-only
git status -sb        # debe mostrar solo: ## master...origin/master
```

**3.3. Verifica todo desde cero.**

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm smoke:package
npm view choropleth-kit        # debe seguir dando 404 la primera vez
```

**3.4. Mira exactamente qué se va a subir.**

```bash
pnpm pack --pack-destination /tmp/ck
tar -tzf /tmp/ck/choropleth-kit-0.1.0.tgz
```

Debe contener `dist/` (sin sourcemaps), `README.md`, `LICENSE` y `package.json`. No debe aparecer `src/`,
`stories/`, `docs/` ni ningún documento interno.

**3.5. Ensayo sin publicar (recomendado).**

```bash
pnpm publish --dry-run
```

**3.6. Publica.**

```bash
pnpm publish
```

Esto ejecuta `prepublishOnly` (`pnpm verify` otra vez, tarda unos minutos porque la suite es lenta) y te pide el
código de un solo uso de tu app de autenticación. `publishConfig` ya incluye `access: public`. pnpm se niega a
publicar si no estás en `master`, si el árbol no está limpio o si no estás al día con `origin`: arregla la causa y
**no uses** `--no-git-checks`.

**3.7. Comprueba que está en npm.**

```bash
npm view choropleth-kit version          # debe responder 0.1.0
```

Abre <https://www.npmjs.com/package/choropleth-kit> y comprueba que el README se ve bien, con la imagen. Después, en
una carpeta vacía de pruebas: `npm init -y && npm i choropleth-kit react react-dom` e importa `ChoroplethMap`.

**3.8. Pon el tag al commit publicado.** Se hace después de publicar, para que el tag signifique siempre «esto es
lo que hay en npm». Si la publicación fallase, no hay nada que deshacer.

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

**3.9. Crea la GitHub Release** (el changelog visible, ver el apartado 4):

```bash
gh release create v0.1.0 --verify-tag --title "v0.1.0" --notes-file notas-0.1.0.md
```

Para la primera release recomiendo escribir las notas a mano en `notas-0.1.0.md` (una lista corta de lo que
incluye: tres niveles de API, cuatro variantes, zoom y drill-down, theming) en lugar de `--generate-notes`, que
listaría todas las PRs desde el principio del repositorio. Desde la segunda release usa `--generate-notes`.

**3.10. Vuelve a sincronizar `develop` con `master`.** La PR de release creó un commit de merge que solo existe en
`master`. Abre una PR de `master` hacia `develop` y mergéala con «Create a merge commit» (si `develop` no está
protegido, basta `git switch develop && git merge --ff-only origin/master && git push`).

## 4. Versionado y changelog en GitHub (manual)

GitHub no versiona nada por sí mismo. Son tres piezas que tú mantienes de acuerdo:

| Pieza                 | Qué es                                                             | Dónde vive                  |
| --------------------- | ------------------------------------------------------------------ | --------------------------- |
| **Versión** (SemVer)  | El número en el campo `version` de `package.json`                  | `package.json`, y npm       |
| **Tag** `vX.Y.Z`      | Un puntero al commit exacto que se publicó                         | Git (pestaña _Tags_)        |
| **Release** de GitHub | Una página asociada a un tag, con las notas de cambios (changelog) | Pestaña _Releases_ del repo |

**Cómo lo ve la gente.** En la barra lateral del repositorio aparece la última release, y en
<https://github.com/Manoplo/choropleth-kit/releases> está la lista completa, versión por versión, con sus notas.
La página de npm enlaza al repositorio, así que ese es el changelog. No hay `CHANGELOG.md` en el repo.

**Qué número elegir (SemVer).** Mientras la versión mayor sea `0`:

| Cambio                                       | Sube    | Ejemplo       |
| -------------------------------------------- | ------- | ------------- |
| Arreglos de fallos, sin cambios de API       | `patch` | 0.1.0 → 0.1.1 |
| Funciones nuevas o cambios que pueden romper | `minor` | 0.1.0 → 0.2.0 |
| API estable y compromiso de no romperla      | `1.0.0` | 0.x → 1.0.0   |

**Las notas se generan a partir de los títulos de las PRs mergeadas**, y por eso `pr-title` obliga a usar
Conventional Commits (`feat:`, `fix:`, `docs:`…). Escribe los títulos pensando en quien los leerá en la release.
Si más adelante quieres que las notas se agrupen en secciones («Features», «Fixes»), se hace con un fichero
`.github/release.yml` y etiquetas en las PRs; se puede añadir sin tocar nada más.

**Para cada versión posterior** (por ejemplo, 0.1.1):

1. En una rama desde `develop`: `npm version 0.1.1 --no-git-tag-version` (solo edita `package.json`; no uses
   `pnpm version`, que se comporta distinto según la versión de pnpm).
2. PR a `develop` con el título `chore: release v0.1.1`, merge.
3. Repite los pasos 3.1 a 3.10 con la nueva versión. En el 3.9 usa `--generate-notes` en lugar de `--notes-file`.

**Pre-releases** (para probar algo arriesgado sin afectar a quien instale la versión estable):

```bash
npm version 0.2.0-beta.0 --no-git-tag-version
pnpm publish --tag beta                                  # se instala con: npm i choropleth-kit@beta
gh release create v0.2.0-beta.0 --verify-tag --prerelease --generate-notes
```

`latest` debe apuntar siempre a una versión estable.

**Más adelante** se puede automatizar: un workflow que se dispare al subir el tag, publique en npm con
_provenance_ y cree la Release (FEAT-015). El flujo manual de arriba es el mismo, solo que sin tu intervención en
los pasos 3.6, 3.8 y 3.9.

## 5. Proteger `master` (una sola vez, en la web)

_Settings → Rules → Rulesets → New ruleset → New branch ruleset_:

- **Nombre:** `protect-master`. **Enforcement status:** _Active_.
- **Target branches:** _Add target → Include default branch_ (es `master`).
- **Reglas a marcar:**
  - _Restrict deletions_ y _Block force pushes_.
  - _Require a pull request before merging_, con **0 aprobaciones** (siendo el único mantenedor, pedir 1 te
    impediría mergear tus propias PRs).
  - _Require status checks to pass_: añade `pnpm verify` y `Packed package installs with npm`.
- **Bypass list:** vacía, para que ni tú puedas hacer push directo por error.

Recomendado además: un ruleset más ligero para `develop` (PR obligatoria y checks) y otro sobre los tags `v*` con
_Restrict deletions_ y _Restrict updates_, para que un tag publicado no se pueda mover ni borrar.

## 6. Cuando algo sale mal

- **Publicaste una versión con un fallo:** no se puede sobrescribir. Publica la siguiente con el arreglo y marca
  la mala: `npm deprecate choropleth-kit@0.1.0 "usa 0.1.1: <motivo>"`.
- **`npm unpublish`** solo se permite durante las primeras 72 horas y si nada depende del paquete. Prefiere
  `deprecate`.
- **Una beta se quedó como `latest`:** `npm dist-tag add choropleth-kit@<versión-buena> latest`.
- **El tag quedó en el commit equivocado y aún no has publicado en npm:** bórralo
  (`git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`), borra la Release y repite. Es destructivo: piénsalo dos veces.
- **El código de un solo uso no llega o falla:** revisa la hora del dispositivo con la app de autenticación; los
  códigos de recuperación están en los ajustes de tu cuenta de npm.

## 7. Probar una PR antes de mergearla (snapshots)

Para probar un cambio en otra app (la web de documentación, un playground con datos reales o sintéticos) sin
mergear ni publicar en npm, ponle a la PR la etiqueta **`publish snapshot`**. Desde entonces, cada push a la
PR construye el paquete y publica una **snapshot**: una pre-release de GitHub `snapshot-pr-<número>-g<sha>` con
el `.tgz`, y un comentario en la PR con el comando de instalación:

```bash
npm i https://github.com/Manoplo/choropleth-kit/releases/download/snapshot-pr-12-g1a2b3c4/choropleth-kit-0.1.0-pr.12.g1a2b3c4.tgz
```

- **La versión es `<versión del package.json>-pr.<número>.g<sha>`** (`0.1.0-pr.12.g1a2b3c4`): una pre-release de
  semver, por debajo de la versión del `package.json` (no se confunde con una release) y distinta en cada commit (una snapshot instalada nunca se sobrescribe, así que
  el hash del lockfile sigue valiendo). Para actualizar, instala la nueva.
- **No se publica nada en npm** y el `package.json` del repositorio no cambia.
- **Se limpia sola**: al cerrar o mergear la PR, o al quitar la etiqueta, se borran sus releases y tags.
- **Solo PRs de este repositorio** (el token de un fork es de solo lectura, a propósito), y solo quien tenga
  permiso de triage puede poner la etiqueta. Las PRs de Dependabot tampoco (token de solo lectura).
- El workflow es `.github/workflows/snapshot.yml`; ejecuta código de la PR con `pull_request`, nunca con
  `pull_request_target`. Que siga así.
