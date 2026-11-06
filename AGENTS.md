# AGENTS.md

Instrucciones para cualquier agente de código que trabaje en este repositorio.

## Reglas (por orden de prioridad)

1. **Commit y push solo bajo petición explícita del usuario.** Nunca hacer `git commit`, `git push`,
   `git commit --amend` ni abrir PRs por iniciativa propia, ni al terminar un paso, ni aunque los tests
   pasen. Deja los cambios sin commitear en el árbol de trabajo para que el usuario los revise
   (`git status` / `git diff`). Una aprobación anterior no autoriza commits posteriores.
2. **Un paso cada vez**, acotado y verificable. No empezar el siguiente hasta que el usuario lo confirme.
3. **Verificación visual**: ningún paso con efecto visible se marca ✅ sin abrir su story en un
   navegador. Si no es posible, decirlo explícitamente y pedir al usuario que lo revise.
4. **Lo puro, a `src/core`** con tests, sin React ni DOM. `src/react` solo orquesta.

## Fuentes de verdad

- `coropleth-library.md` (alias `dd.md`): diseño y handoff (`§21` es el vigente).
- `choropleth-build-proccess.md`: diario de construcción. Cada paso se documenta ahí (qué, por qué,
  orden interno, decisiones, tests, preguntas de comprobación). **Empieza por su sección «Estado actual y
  handoff»**: dice dónde estamos, qué decidió el humano, las trampas conocidas y qué leer para el siguiente
  paso. **No leas los dos documentos enteros** (casi 5.000 líneas): lee solo lo que gobierna el paso.

## Comandos

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:coverage` (core ≥ 90 %) · `pnpm build` ·
`pnpm storybook`. Solo pnpm; npm y yarn están bloqueados.

## Convenciones

- Idioma: documentación y comentarios en español; mensajes de consola y textos de UI en inglés.
- Pre-1.0 se puede romper la API sin alias de compatibilidad, actualizando tests y stories en el mismo paso.
- Pasar `pnpm typecheck`, `pnpm lint` y `pnpm test` antes de dar un paso por terminado.
