# AGENTS.md

Instructions for any coding agent working in this repository.

## Rules (in priority order)

1. **Commit and push only on the user's explicit request.** Never run `git commit`, `git push`,
   `git commit --amend` or open PRs on your own initiative, neither when finishing a step nor even if
   the tests pass. Leave the changes uncommitted in the working tree so the user can review them
   (`git status` / `git diff`). A previous approval does not authorize later commits.
2. **One step at a time**, bounded and verifiable. Do not start the next one until the user confirms.
3. **Visual verification**: no step with a visible effect is marked ✅ without opening its story in a
   browser. If that is not possible, say so explicitly and ask the user to review it.
4. **Pure logic goes in `src/core`** with tests, with no React or DOM. `src/react` only orchestrates.

## Sources of truth

- `evolution-and-issues/`: **since the MVP closed (step 37)**, new features (`features/FEAT-NNN-*.md`)
  and issues (`issues/ISSUE-NNN-*.md`) live here, one document per item. Start with its `README.md`.
- `coropleth-library.md` (alias `dd.md`): design and handoff (`§21` was the last one in force). Written in Spanish.
- `choropleth-build-proccess.md`: the MVP's build diary, now a **historical record** (written in Spanish).
  Its section «Estado actual y handoff» says where the MVP ended, what the human decided and the known
  traps. **Do not read the two documents in full** (almost 5,000 lines): read only what governs the task.

## Commands

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:coverage` (core ≥ 90 %) · `pnpm build` ·
`pnpm storybook` · `pnpm size` (bundle size, `size-limit`) · `pnpm verify` (everything above + `publint`
and `attw`; it is what `prepublishOnly` runs).
`pnpm smoke:package` (packs the library, installs it with npm in an empty project and renders a map).
CI (`.github/workflows/`) runs on every PR to `develop`/`master`: Verify, Quality (coverage, Storybook, package smoke test),
Size, Dependency review, CodeQL and PR title (Conventional Commits). Dependabot opens weekly update PRs against `develop`.
pnpm only; npm and yarn are blocked (the guard is in `prepare`, not in `preinstall`: a `preinstall`
would be published and would break `npm install choropleth-kit` for consumers).

## Conventions

- **Language: English for everything** — code comments, JSDoc, READMEs, docs, stories, test titles,
  console messages, UI texts and defaults. (The two historical documents above are the exception.)
  Console messages are prefixed `[choropleth]`.
- Pre-1.0 the API may break without a compatibility alias, updating tests and stories in the same step.
- Pass `pnpm typecheck`, `pnpm lint` and `pnpm test` before declaring a step done.
