# choropleth-kit · Pre-publication review and release runbook

> **What this is.** A review of the state of the library before its first npm publish (`0.1.0`), the list of
> changes to make before publishing, and step-by-step instructions to publish and to version it on GitHub
> (by a coding agent through the GitHub MCP / `gh`, or by a human).
>
> **Snapshot date:** 2026-11-09. Branch `feat/pre-pub`, PR [#7](https://github.com/Manoplo/choropleth-kit/pull/7)
> (`feat: pre-pub, actions, translations`) against `master`. Re-check the facts in §1 before acting on them.
>
> **Rules for the agent that picks this up** (from `AGENTS.md`, they win over anything here):
>
> 1. **Never commit, push, tag, merge, publish or change repository settings without an explicit request.**
>    A previous approval does not cover the next action. Publishing to npm and creating tags/releases are
>    irreversible in practice: always ask first.
> 2. One item at a time; run `pnpm typecheck && pnpm lint && pnpm test` (or `pnpm verify`) before calling it done.
> 3. Anything with a visible effect needs a human look in Storybook.
> 4. Everything you write is in English.

---

## 0. Verdict

The library is **technically ready to publish as `0.1.0`** (green `pnpm verify`, `publint` and `attw` clean,
a real `npm install` of the tarball renders a map, the name `choropleth-kit` is still free on npm). What
stands between today and the first publish is **not code quality** but:

1. **Two red checks** on PR #7, both caused by configuration, not by the code (§2).
2. **A branch-model inconsistency**: every workflow and Dependabot target a `develop` branch that does not exist (§3, PP-01).
3. **One probable runtime bug with consumer bundlers**: development warnings are likely **not** stripped in
   production builds (§3, PP-03).
4. **Internal context leaking into a public repo and into the shipped types** (§3, PP-04 and PP-05).
5. **Attribution of the bundled geodata** and the **pending human visual review** (§3, PP-06 and PP-07).

Each one is small. With them done, the release itself is the runbook in §5.

---

## 1. Current state (facts checked on 2026-11-09)

### 1.1 PR #7

| Field           | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Head / base     | `feat/pre-pub` (`98d6bf2`) → `master` (`2026f07`)                                           |
| Size            | 1 commit, 176 files, +5,343 / −2,943                                                        |
| Mergeable state | `unstable` (mergeable, but with failing checks)                                             |
| Checks          | 6 green (`pnpm verify`, coverage, Storybook, package smoke test, CodeQL ×2), **2 red** (§2) |
| Repo            | **public**, default branch `master`, remote branches: `master` and `feat/*` (no `develop`)  |

What the PR brings (it is the "step 37" of the build diary plus the move to English):

- **Package metadata and npm readiness:** `LICENSE` (MIT, Manuel Martín), `README.md`, `PUBLISHING.md`, `files`,
  `exports`, `typesVersions`, `sideEffects`, `keywords`, `repository`/`bugs`/`homepage`, `prepublishOnly: pnpm verify`.
  The pnpm-only guard moved from `preinstall` to `prepare` (a published `preinstall` would break `npm i choropleth-kit`).
- **Quality gates:** `.size-limit.json`, `publint` + `attw` (`check:package`), `scripts/smoke-package.mjs`
  (packs, installs with npm in an empty project, server-renders each entry point).
- **CI:** six workflows and Dependabot (§2).
- **Code:** `useCamera`, `Performance/AdminLevel` and `Zoom/Cooperative` stories, a test that runs the README
  example, everything translated to English (comments, JSDoc, stories, tests, console messages).
- **Process:** `evolution-and-issues/` (21 features, 12 issues) replaces the build diary for post-MVP work.

### 1.2 What would ship (`pnpm pack --dry-run`)

`dist/index.js`, `dist/core.js`, `dist/geo.js`, a shared chunk, `dist/styles.css`, their `.d.ts`, `LICENSE`,
`README.md`, `package.json`. No sourcemaps, no `src`, no docs. Correct.

| Measure (gzip, from CI `size-limit`)       | Size    | Limit |
| ------------------------------------------ | ------- | ----- |
| Own code (`core` + `react`, deps external) | 28.8 KB | 50 KB |
| `ChoroplethMap` with all of d3 (no React)  | 71.6 KB | 75 KB |
| `core` alone with its deps                 | 43.9 KB | 50 KB |
| `styles.css`                               | 2.3 KB  | 5 KB  |
| `geo` (world 1:110m, data)                 | 40.2 KB | 60 KB |

Runtime dependencies are all external (not bundled): `d3-*` (ISC), `topojson-client` (ISC), `polylabel` (ISC),
`@types/geojson` and `@types/topojson-specification` (MIT, needed because they appear in the public types).
**Bundled into `dist/geo.js`:** geometry derived from `world-atlas` (ISC, © Mike Bostock; data from Natural Earth,
public domain) and an ISO table generated with `i18n-iso-countries` (MIT) at build time.

### 1.3 Other facts

- `package.json` version: `0.1.0`. No `CHANGELOG.md`, no git tags, no GitHub releases.
- `npm view choropleth-kit` → 404 (name free). Local npm is 10.9.2; `gh` 2.54.0 is installed.
- Tests: 887 per the diary at step 37; CI `pnpm verify` green. The suite is slow and wall-clock sensitive
  (ISSUE-002): `prepublishOnly` runs it, so a local publish can take minutes.
- Human visual review still pending for steps 25, 26 and 34-37 (ISSUE-007).

---

## 2. The CI on PR #7: why two checks fail, and what each workflow is worth

### 2.1 `Dependency review` fails

```
Error: Dependency review is not supported on this repository.
Please ensure that Dependency graph is enabled, see .../settings/security_analysis
```

**Cause:** the repository's **Dependency graph is disabled**. `actions/dependency-review-action` asks the
dependency-graph API for the diff of dependencies between base and head; with the graph off, the API refuses.
The repo is public, so the graph, Dependabot alerts and dependency review are **free** — it only needs to be
switched on. Nothing in the workflow is wrong.

**Fix (human, needs repo admin; the MCP token used so far has `admin: false`, so an agent cannot do it):**
Settings → _Code security_ (or _Advanced Security_) → **Dependency graph: Enable**. While there, also enable
**Dependabot alerts** (and optionally _Dependabot security updates_). Then re-run the job on PR #7.

**After enabling, check** (Insights → Dependency graph) that the packages from `pnpm-lock.yaml` are listed.
If only `package.json` shows up, dependency review still works but sees ranges instead of resolved versions.

### 2.2 `Size` fails

Two separate things show up in the log:

1. **`Unexpected input(s) 'package_manager'`** — `andresz1/size-limit-action@v1` has no such input (valid ones:
   `github_token`, `build_script`, `clean_script`, `skip_step`, `directory`, `windows_verbatim_arguments`). It is
   only a warning: the action detects pnpm from the lockfile anyway. Remove the line.
2. **The real failure: the base branch cannot be measured.** The action measures the PR head (that part worked:
   all five limits pass) and then checks out `master`, installs, builds and runs `npx size-limit --json` there to
   compute the diff. **`master` does not have `size-limit`, its plugins or `.size-limit.json` yet** (this very PR
   adds them), so `npx` downloads a bare `size-limit`, which prints "Install Size Limit preset…" instead of JSON,
   and the action crashes with `Unexpected end of JSON input`.

**This is a bootstrap problem: it only happens on the PR that introduces size-limit.** Once PR #7 is merged,
`master` has the config and later PRs will compare fine. Note that the job has `continue-on-error: true`, so the
workflow run counts as successful, but the check still shows a red ✗ in the PR, which is confusing.

### 2.3 Value of each workflow (recommendation)

| Workflow                | Value for this library         | Why                                                                                                                                                                                                                                           | Recommendation                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify.yml`            | **High**                       | Runs exactly what `prepublishOnly` runs. The real gate.                                                                                                                                                                                       | Keep. Make it a **required** check on `master`.                                                                                                                                                                                                             |
| `quality.yml` (3 jobs)  | **High**                       | The npm smoke test catches what nothing else does (broken `exports`, lifecycle scripts that break consumers). Storybook build = docs do not rot. Coverage = the `core ≥ 90 %` rule.                                                           | Keep. Make `Packed package installs with npm` required. The coverage "summary" step adds nothing (it prints a fixed sentence): drop it or write the real table.                                                                                             |
| `dependency-review.yml` | **Medium**                     | Free on a public repo. Shifts left two real risks for a published package: a new runtime dependency with a known vulnerability and a copyleft license sneaking in. Defaults only fail on `runtime` scope, so dev-tool advisories won't block. | Keep, **after enabling the dependency graph**. Not required until it has run green a few times.                                                                                                                                                             |
| `codeql.yml`            | **Low–medium**                 | Client-side rendering library, no server, no `eval`, no HTML injection: little surface. But it is free and weekly. Running on every PR costs ~1 min.                                                                                          | Keep (cheap insurance for an OSS package). Do not enable CodeQL _default setup_ as well, or the two configurations conflict.                                                                                                                                |
| `size.yml` (andresz1)   | **Low**                        | Only adds a PR comment with the size **delta**. The hard limits are already enforced by `pnpm verify`. Costs: builds twice per PR, a third-party action with `pull-requests: write`, no recent maintenance (deprecation warnings).            | **Replace or drop.** Simplest: delete `size.yml` and append the `size-limit` table to `$GITHUB_STEP_SUMMARY` in `verify.yml`. If the delta comment is wanted, keep it, remove `package_manager`, pin it to a SHA, and accept the one-time failure on PR #7. |
| `pr-title.yml`          | **Medium** (if squash-merging) | With squash merges the PR title becomes the commit, and GitHub's _Generate release notes_ and any future changelog tool read it. Uses `pull_request_target` safely (never checks out PR code).                                                | Keep. It did **not** run on PR #7 because `pull_request_target` uses the workflow file from the **base** branch, and `master` does not have it yet: it starts working after the merge.                                                                      |
| `dependabot.yml`        | **Medium**                     | Weekly grouped updates for deps and actions.                                                                                                                                                                                                  | **Broken today:** `target-branch: develop` does not exist (see PP-01). Fix before merging or Dependabot will report a configuration error.                                                                                                                  |

Cross-cutting: third-party actions (`andresz1/size-limit-action`, `amannn/action-semantic-pull-request`) are
referenced by tag. For a published package, **pin third-party actions to a commit SHA** (Dependabot's
`github-actions` ecosystem keeps SHAs updated). First-party `actions/*`, `github/*`, `pnpm/*` by tag is acceptable.

---

## 3. Changes before publishing

Each item: **what**, **why**, **where**, **done when**. IDs are stable so the human can answer "do PP-03".

### 3.1 Must (blockers for `0.1.0`)

#### PP-01 · Branch model: `develop` does not exist — **decision for the human**

- **What:** all six workflows trigger on PRs to `[develop, master]`, Dependabot uses `target-branch: develop`, and
  `AGENTS.md` says CI runs on PRs to `develop`/`master`. The remote has no `develop`.
- **Options:** (a) create `develop` from `master` right after merging PR #7 (`git switch master && git pull &&
git switch -c develop && git push -u origin develop`), make it the PR target and release by merging
  `develop → master`; or (b) trunk-based: remove `develop` from the six workflows, Dependabot and `AGENTS.md`.
- **Recommendation:** (a) if the author wants an integration branch (it matches what is already written);
  (b) if releases will be cut straight from `master` (simpler for a single maintainer). Ask.
- **Done when:** Dependabot shows no config error (Insights → Dependency graph → Dependabot) and docs match reality.

#### PP-02 · Make PR #7's checks honest

- Enable the dependency graph (§2.1, human).
- Decide on `size.yml` (§2.3). If kept: remove `package_manager: pnpm`; the one-time failure on PR #7 is expected.
- Pin third-party actions to SHAs.
- Optional, human: branch protection on `master` with `pnpm verify` and `Packed package installs with npm` as required checks.
- **Done when:** PR #7 (or a follow-up) shows no red check that is not understood.

#### PP-03 · Development warnings are probably not stripped in consumers' production builds

- **Where:** `src/react/env.ts`:
  ```ts
  export const isProduction = (): boolean =>
    typeof process !== "undefined" && process.env["NODE_ENV"] === "production";
  ```
- **Why it is probably wrong:** bundlers (Vite, webpack 5, esbuild, Rollup with replace) statically replace the
  **dotted** expression `process.env.NODE_ENV`, but do not define `process` itself in the browser. So in a Vite or
  webpack 5 production build, `typeof process` is `"undefined"` at runtime → `isProduction()` returns `false` →
  join diagnostics, drill hints and `zoomTo` warnings are **printed in the consumer's production console**, and the
  diagnostic code is never dead-code-eliminated. The bracket form `process.env["NODE_ENV"]` also tends to escape
  the replacement. Nothing tests this today: the smoke test runs in Node, where `process` exists.
- **Verify first:** build a tiny Vite app in production that imports `ChoroplethMap` with an unmatched id and
  check the browser console; or grep the built bundle for `[choropleth]`.
- **Likely fix** (keeps working without a bundler and lets bundlers fold it to a constant):
  ```ts
  export const isProduction = (): boolean => {
    try {
      return process.env.NODE_ENV === "production";
    } catch {
      return false; // no bundler and no `process`: behave as development
    }
  };
  ```
- **Add a test that would have caught it:** extend `scripts/smoke-package.mjs` with a production bundle step
  (esbuild with `--define:process.env.NODE_ENV='"production"' --platform=browser`) and assert that the
  output does not contain the diagnostic strings.
- **Done when:** a production browser bundle contains no `[choropleth] … have no matching geometry` text.

#### PP-04 · Internal references in the published types

- **What:** the JSDoc of `focusBounds`/`DEFAULT_FOCUS_BOUNDS` in `src/core/zoom.ts` (line ~31) says
  "For Inditex, the Canary Islands…", and it ends up in `dist/drill-chain-*.d.ts`, i.e. in every consumer's editor.
  Separately, **78 references to `dd.md §N`** ship in the `.d.ts` files: consumers cannot open that document (it is
  not in the package and it is in Spanish).
- **Fix:** reword the Canary Islands comment in neutral terms ("Spain is framed with the Canary Islands by default;
  pass `{ ES: null }` for the peninsula only"). For `dd.md §N` in **public** JSDoc (exported types and functions),
  replace with a sentence that stands alone or with a README anchor; internal comments can keep them.
- **Check:** `pnpm build && grep -ci inditex dist/*.d.ts` → 0; `grep -c "dd.md" dist/*.d.ts` → 0 (or only in non-exported items).

#### PP-05 · Public repo with employer context — **decision for the author, not technical**

- **What:** the repo is already public and `coropleth-library.md` mentions Inditex 18 times, together with internal
  product names, internal design systems, a release process through the company's OSPO/Legal (its §18) and the
  advice to "confirm MIT with the organization" (ISSUE-011). The npm tarball does not include these files, but the
  `README` links to them.
- **Why it matters before publishing:** publishing to npm makes the project discoverable. The author should confirm
  that he is free to publish it under his own name and MIT, and decide whether the design doc stays public as is,
  gets a scrubbed version, or moves to a private place (git history keeps old versions: scrubbing a public repo's
  history is a separate, destructive operation that needs explicit approval).
- **Done when:** ISSUE-011 records the decision.

#### PP-06 · Attribution for bundled data

- **What:** `dist/geo.js` contains geometry derived from `world-atlas` (ISC, which requires keeping the copyright
  notice in copies) based on Natural Earth (public domain).
- **Fix:** add a short **"Data and third-party notices"** section to the README (world-atlas ISC © Mike Bostock;
  Natural Earth public domain; ISO table built with `i18n-iso-countries`, MIT, at build time) and a one-line
  banner at the top of `dist/geo.js` (tsup `banner.js` for the `geo` entry, or a comment in `src/geo/index.ts` that
  survives minification — tsup does not minify by default, so a `/*! … */` comment is kept).
- **Done when:** the notice is in the README and visible at the top of `dist/geo.js`.

#### PP-07 · Human visual review of the unconfirmed steps (ISSUE-007)

- Steps 25, 26 and 34-37 are `✅*` (code and tests done, never looked at by a human). At least the stories that the
  README promotes: `Preset`, `Variants`, `Zoom/Cooperative`, `Zoom/FocusAndFlights`, `DrillDown/Uncontrolled`,
  `Styling/Themes`. An agent can drive Chrome with `scripts/cdp-story.mjs` to check interactions, but the "looks
  right" verdict is the human's.
- **Done when:** ISSUE-007 is closed or narrowed to what is knowingly deferred.

### 3.2 Should (strongly recommended before `0.1.0`, cheap)

| ID    | What                                                                                                                                                                                                                                                                                                                                                                               | Where                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| PP-08 | **English everywhere it shows up:** the five `name`s in `.size-limit.json` are in Spanish (they appear in CI logs and PR comments); the `prepare` guard prints "Usa pnpm. Este proyecto no admite npm ni yarn."                                                                                                                                                                    | `.size-limit.json`, `package.json`   |
| PP-09 | **React 18 is promised but never tested:** `peerDependencies: react >=18`, dev and smoke test use React 19 and `@types/react` 19. Add a second smoke run with `react@18 react-dom@18` and a `tsc --noEmit` of a consumer file with `@types/react@18` (types written against 19 may not compile on 18). If it fails and it is not trivial, change the peer range to `>=19` instead. | `scripts/smoke-package.mjs`          |
| PP-10 | **README for npm:** add a screenshot/GIF at the top (use an absolute `https://raw.githubusercontent.com/...` URL so npmjs.com renders it), a "Status: 0.x, API may change" line already exists (keep), link to a hosted Storybook if PP-11 is done. Relative links to repo files are rewritten by npm to GitHub, so they work.                                                     | `README.md`                          |
| PP-11 | **Publish Storybook to GitHub Pages** (a `pages.yml` workflow on push to `master`: `pnpm build-storybook` → `actions/upload-pages-artifact` → `actions/deploy-pages`). Cheap living docs until FEAT-014; set `homepage` to it.                                                                                                                                                     | `.github/workflows/`, `package.json` |
| PP-12 | **Changelog:** either a hand-written `CHANGELOG.md` ("0.1.0 — first public release" + feature list from the README) or decide that GitHub Releases are the changelog. Pick one and say so in `PUBLISHING.md`.                                                                                                                                                                      | root                                 |
| PP-13 | **`publishConfig`:** add `"publishConfig": { "access": "public" }` so nobody forgets it. Do **not** add `"provenance": true` while publishing from a laptop (npm refuses provenance outside a supported CI).                                                                                                                                                                       | `package.json`                       |
| PP-14 | **`PUBLISHING.md` is out of date** in two points: it says `pnpm version …` (behaviour differs across pnpm versions; use the steps in §5.1), and it does not mention tags/GitHub Releases. Replace its "Every release" section with §5 of this document or link here.                                                                                                               | `PUBLISHING.md`                      |
| PP-15 | **Disputed borders (ISSUE-005):** for an OSS package, the README warning is a reasonable minimum. Add one line saying the geometry follows Natural Earth's _de facto_ boundaries and that consumers can pass their own geography. Close ISSUE-005 with that as the policy, or leave it open for a "point-of-view" variant later.                                                   | `README.md`, ISSUE-005               |

### 3.3 Could (after `0.1.0`)

- **Publish from CI with trusted publishing and provenance** (§5.4) — FEAT-015.
- `changesets` once there are contributors or several releases a month.
- `ISSUE-001` (weight with d3 ≈ 72 KB): lazy-load zoom/drill.
- `ISSUE-002` (slow suite): it makes `prepublishOnly` slow; split the real-choreography tests into their own Vitest project.
- `ISSUE-008` (CJS) only if someone asks.
- Delete stale remote branches (`feat/*` already merged, `internal/opus-review`) — destructive, ask first.

### 3.4 Suggested order of work

1. Human: enable the dependency graph; decide PP-01 and PP-05.
2. Agent, on `feat/pre-pub` (so PR #7 carries them) **or** on a follow-up branch after merging #7 — ask which:
   PP-02 (workflow edits), PP-03, PP-04, PP-06, PP-08, PP-13, PP-14, then PP-09, PP-10, PP-12, PP-15.
3. Human: PP-07 visual review.
4. Merge PR #7 (squash, title `feat: pre-pub, actions, translations` is already Conventional).
5. If PP-01 (a): create `develop`.
6. Release `0.1.0` with §5.

---

## 4. Versioning policy

- **SemVer, pre-1.0 rules:** while the major is `0`, a **minor** bump (`0.1.0 → 0.2.0`) may break the API
  (`AGENTS.md` allows breaking without aliases before 1.0); a **patch** (`0.1.0 → 0.1.1`) is fixes only.
- **Tags:** annotated, `v` prefix, on the exact commit that was published: `v0.1.0`.
- **One GitHub Release per tag**, notes generated from merged PR titles (Conventional Commits, enforced by `pr-title.yml`).
- **Pre-releases:** `0.2.0-beta.0` published with the `beta` dist-tag (`npm i choropleth-kit@beta`), GitHub Release
  marked _pre-release_. `latest` must always point to a stable version.
- **Never re-publish a version.** A bad version is deprecated and superseded (§5.5).
- First release: `0.1.0` (already in `package.json`, no bump needed).

---

## 5. Release runbook

### 5.0 Preconditions (all paths)

- [ ] Everything in §3.1 is done or explicitly waived by the human.
- [ ] Working tree clean, on `master`, up to date with `origin/master` (`git status -sb` shows `## master...origin/master` and nothing else).
- [ ] `pnpm install --frozen-lockfile && pnpm verify && pnpm smoke:package` green locally.
- [ ] `npm view choropleth-kit` → 404 (first time) or shows the previous version (later releases).
- [ ] Version decided and, if it changes, bumped in a PR (see 5.1 step 1).

### 5.1 Path A — a human publishes from the laptop (recommended for `0.1.0`)

One-time setup: npm account, email verified, **2FA for authorization and publishing**, `npm login`, `npm whoami`.

1. **Bump (not needed for 0.1.0).** On a branch `release/vX.Y.Z`:
   `npm version X.Y.Z --no-git-tag-version` (only edits `package.json`; it does not run `prepare`), update
   `CHANGELOG.md` if PP-12 chose it, commit `chore(release): vX.Y.Z`, open a PR, merge it into `master`.
2. **Sync:** `git switch master && git pull --ff-only`.
3. **Inspect the tarball:** `pnpm pack --pack-destination /tmp/ck && tar -tzf /tmp/ck/choropleth-kit-X.Y.Z.tgz`.
4. **Publish:** `pnpm publish --access public` (runs `prepublishOnly` → `pnpm verify`, then asks for the OTP;
   or pass `--otp 123456`). For a pre-release: `pnpm publish --tag beta`.
5. **Check:** <https://www.npmjs.com/package/choropleth-kit> and, in a scratch folder,
   `npm i choropleth-kit react react-dom` + import it.
6. **Tag the published commit:** `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
7. **GitHub Release:** `gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --generate-notes`
   (add `--prerelease` for betas), or use the UI (5.3).

Tag **after** publishing: the tag then always means "this is what npm has". If the publish fails, nothing to undo.

### 5.2 Path B — a coding agent drives it (GitHub MCP + `gh` + git)

**Ask for explicit approval before each irreversible step** (merge, tag, release, publish). Suggested wording:
"Ready to <action>. Proceed?"

What the GitHub MCP server available in this workspace **can** do: read PRs/checks (`pull_request_read`), create
branches (`create_branch`), push files (`push_files`, `create_or_update_file`), open and merge PRs
(`create_pull_request`, `merge_pull_request` with `merge_method: "squash"`), and read tags and releases
(`list_tags`, `get_tag`, `list_releases`, `get_latest_release`, `get_release_by_tag`).

What it **cannot** do: **create tags or releases** (no such tool), change repository settings, or publish to npm.
For those, the agent uses `git` / `gh` in the terminal, and npm publishing stays with the human (it needs the OTP;
never ask for the OTP or npm token through chat).

Sequence for a release `vX.Y.Z`:

1. _(only if bumping)_ `create_branch` `release/vX.Y.Z` from `master` → edit `package.json` (and changelog) →
   commit/push → `create_pull_request` (title `chore(release): vX.Y.Z`, base `master`).
2. Wait until `pull_request_read` `get_check_runs` is all green → **ask** → `merge_pull_request` (squash).
3. Locally: `git switch master && git pull --ff-only && pnpm install --frozen-lockfile && pnpm verify`.
4. **Hand over to the human** for `pnpm publish --access public` (5.1 step 4). Wait for confirmation and check with
   `npm view choropleth-kit version`.
5. **Ask**, then tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
6. **Ask**, then release: `gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --generate-notes`
   (`gh auth status` first; if `gh` is not authenticated, the human runs `gh auth login`).
7. Verify through MCP: `get_release_by_tag` with `tag: "vX.Y.Z"` returns the release; `list_tags` shows the tag.

Once §5.4 exists, steps 4-6 collapse into "push the tag" and the workflow publishes and creates the release.

### 5.3 Path C — a human uses the GitHub UI for the tag and release

After publishing (5.1 steps 1-5): GitHub → **Releases** → **Draft a new release** → _Choose a tag_ → type
`vX.Y.Z` → _Create new tag on publish_ → target `master` → **Generate release notes** → edit if needed → mark
_Set as a pre-release_ for betas → **Publish release**. This creates the tag on the current tip of `master`, so do
it right after publishing, before anything else is merged.

### 5.4 Later — publishing from CI (FEAT-015)

Proposal for `.github/workflows/release.yml` (not created yet; review before adding):

```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write # create the GitHub Release
  id-token: write # npm trusted publishing (OIDC) + provenance
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm # optional: a protected environment that needs a manual approval
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: npm install -g npm@latest # trusted publishing needs a recent npm CLI
      - run: pnpm install --frozen-lockfile
      - name: Tag matches package.json
        run: test "v$(node -p 'require("./package.json").version')" = "$GITHUB_REF_NAME"
      - run: pnpm verify && pnpm smoke:package
      - run: pnpm pack --pack-destination ./out
      # Publish the tarball, not the folder: `npm publish .` would run `prepare`, whose pnpm guard fails under npm.
      - run: npm publish ./out/*.tgz --access public --tag ${{ contains(github.ref_name, '-') && 'beta' || 'latest' }}
      - run: gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes ${{ contains(github.ref_name, '-') && '--prerelease' || '' }}
        env:
          GH_TOKEN: ${{ github.token }}
```

Setup on npmjs.com (human, after the first manual publish creates the package): package → _Settings_ →
**Trusted publishing** → GitHub Actions → owner `Manoplo`, repo `choropleth-kit`, workflow `release.yml`
(and environment `npm` if used). With trusted publishing there is no `NPM_TOKEN` secret and npm attaches
provenance automatically. Check npm's documentation at that moment for the minimum npm CLI version.

### 5.5 When something goes wrong

- **Bad version on npm:** you cannot overwrite it. Publish `X.Y.Z+1` with the fix, then
  `npm deprecate choropleth-kit@X.Y.Z "use X.Y.Z+1: <reason>"`. `npm unpublish` only within 72 h and only if nothing
  depends on it; prefer `deprecate`.
- **Wrong dist-tag** (a beta became `latest`): `npm dist-tag add choropleth-kit@<good> latest`.
- **Tag on the wrong commit, release not published to npm yet:** `git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`,
  delete the GitHub Release, redo. Destructive: ask first.
- **`pnpm publish` refuses** ("branch is not master" / "unclean working tree" / "not up to date"): fix the cause;
  do not use `--no-git-checks` unless the human asks.

---

## 6. Hand-off prompt for the next agent

> Read `AGENTS.md` and this file (`choropleth-prepub.md`). Re-check §1 (PR #7 checks, branches, `npm view
choropleth-kit`). Then ask the human which of §3.1 to start with and whether to work on `feat/pre-pub` or on a
> follow-up branch. Do one item at a time, verify with `pnpm verify` (and `pnpm smoke:package` for packaging
> changes), summarize, and stop. Never commit, push, merge, tag, release or publish without an explicit request
> for that specific action. npm publishing and repository settings are done by the human.
