# Publishing choropleth-kit to npm

The release checklist. **`choropleth-kit@0.1.0` is already published** (2026-11-12, <https://www.npmjs.com/package/choropleth-kit>, tag `v0.1.0`);
everything below is for the next versions. **Nothing here runs by itself**: publishing
is always a decision of the maintainer (see `AGENTS.md`: agents never commit, push or publish unasked).

## Once: set up npm (done for this project; kept for a new machine or maintainer)

1. Create an account at <https://www.npmjs.com/signup> and verify your email.
2. Turn on two-factor authentication (Account → Two-Factor Authentication → _Authorization and
   publishing_). npm will ask for a one-time code on every publish.
3. Log in from the terminal: `npm login` (a browser window opens). Check with `npm whoami`.
4. Check what is published: `npm view choropleth-kit version` answers the latest version (`0.1.0` or later).

## Every release

The flow is **`develop` → `master` → release branch from `master` → publish from `master`**. Nothing is published
from a branch, and the version is never bumped on `develop`.

1. **Merge `develop` into `master`.** Open a PR `develop` → `master` titled `chore: release vX.Y.Z` (it must be a
   Conventional Commit) and merge it with **"Create a merge commit"**, not squash: a squash puts a commit on `master`
   that `develop` does not have, and the two branches start to diverge.
2. **Bump the version.** `git switch master && git pull --ff-only`, then on a branch `release/vX.Y.Z` run
   `npm version X.Y.Z --no-git-tag-version` (it only edits `package.json`; `pnpm version` behaves differently
   across pnpm versions, so do not use it). While the major is `0`, a `minor` bump may break the API.
   Commit `chore(release): vX.Y.Z`, open a PR against `master` and merge it.
3. **Sync**: `git switch master && git pull --ff-only`. The tree must be clean.
4. **Verify**: `pnpm install --frozen-lockfile && pnpm verify && pnpm smoke:package`.
5. **Look at what will ship**: `pnpm pack --pack-destination /tmp/ck && tar -tzf /tmp/ck/choropleth-kit-X.Y.Z.tgz`.
   Expected: `dist/` without sourcemaps, `README.md`, `LICENSE`, `package.json`.
6. **Publish**: `pnpm publish` (`publishConfig` already sets `access: public`). It runs `prepublishOnly`
   (`pnpm verify`) and asks for the one-time code.
7. **Check** <https://www.npmjs.com/package/choropleth-kit> and, in a scratch project, `npm i choropleth-kit`.
8. **Tag the published commit** (after publishing, so the tag always means "this is what npm has"):
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
9. **GitHub Release**: `gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --generate-notes`
   (add `--prerelease` for betas).
10. **Sync `develop`**: the release left commits that only exist on `master` (the merge commit and the version bump).
    Open a PR `master` → `develop` and merge it with "Create a merge commit".

## Changelog

GitHub Releases are the changelog: every version has a Release page (<https://github.com/Manoplo/choropleth-kit/releases>)
whose notes list the pull requests merged since the previous one. `--generate-notes` builds them from the PR
titles, which `pr-title` requires to be Conventional Commits, so write titles a user can read. There is no
`CHANGELOG.md`. Spanish version of this guide: [`PUBLISHING.es.md`](./PUBLISHING.es.md).

## Pre-releases

Publish risky changes under a tag so `npm i choropleth-kit` keeps installing the stable one:

```bash
npm version 0.2.0-beta.0 --no-git-tag-version
pnpm publish --tag beta          # users opt in with: npm i choropleth-kit@beta
gh release create v0.2.0-beta.0 --verify-tag --prerelease --generate-notes
```

Never publish a version twice: a bad one is deprecated and superseded.

## Try a pull request before merging it (snapshots)

To test a change in another app (a docs site, a playground with real or synthetic data) without merging or
publishing to npm, put the label **`publish snapshot`** on the PR. Every push to it then builds the package
and publishes a **snapshot**: a GitHub pre-release `snapshot-pr-<number>-g<sha>` with the packed `.tgz`, plus a
comment on the PR with the install command:

```bash
npm i https://github.com/Manoplo/choropleth-kit/releases/download/snapshot-pr-12-g1a2b3c4/choropleth-kit-0.1.0-pr.12.g1a2b3c4.tgz
```

- **The version is `<package.json version>-pr.<number>.g<sha>`** (`0.1.0-pr.12.g1a2b3c4`): a semver pre-release,
  below the version in `package.json` (so it can never be mistaken for a release), and different on every commit (an installed snapshot is never overwritten, so lockfiles keep
  their integrity hash). Install the new one to update.
- **Nothing goes to npm** and `package.json` is not modified in the repository.
- **Clean-up is automatic**: closing or merging the PR, or removing the label, deletes its releases and tags.
- **Only PRs from this repository** get snapshots (a fork's token is read-only, by design), and only people
  with triage access can add the label. Dependabot PRs cannot either (read-only token).
- Re-run the workflow (`Snapshot`) from the Actions tab if a build failed for a reason unrelated to the PR.
- The workflow is `.github/workflows/snapshot.yml`; it runs PR code with `pull_request`, never with
  `pull_request_target`. Keep it that way.

## When something goes wrong

- **Published a bad version:** you cannot overwrite a version. Publish a fixed one, and mark the bad one with
  `npm deprecate choropleth-kit@0.1.0 "use 0.1.1: <reason>"`.
- **`npm unpublish`** is only allowed within 72 hours of publishing (and not if other packages depend on it).
  Prefer `deprecate`.
- **The ownership code (OTP) does not arrive or fails:** check the 2FA app's clock; recovery codes are in your npm account settings.

## Later (see `evolution-and-issues/features/FEAT-015-production-v1.md`)

Publish from CI instead of your laptop, with **provenance** (npm's trusted publishing from GitHub Actions) and
`changesets` for versioning and changelogs.
