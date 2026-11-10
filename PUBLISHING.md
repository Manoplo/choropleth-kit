# Publishing choropleth-kit to npm

A checklist for the first publish and for later releases. **Nothing here runs by itself**: publishing
is always a decision of the maintainer (see `AGENTS.md`: agents never commit, push or publish unasked).

## Once: set up npm

1. Create an account at <https://www.npmjs.com/signup> and verify your email.
2. Turn on two-factor authentication (Account → Two-Factor Authentication → _Authorization and
   publishing_). npm will ask for a one-time code on every publish.
3. Log in from the terminal: `npm login` (a browser window opens). Check with `npm whoami`.
4. Check the name is free: `npm view choropleth-kit` should answer `404 Not Found` (it was free on
   2026-11-07). The name is yours as soon as you publish it, so do not wait too long.

## Every release

Releases are cut from `master`, after `develop` has been merged into it. Nothing is published from a branch.

1. **Bump the version** (not needed for `0.1.0`). On a branch `release/vX.Y.Z` from `master`, run
   `npm version X.Y.Z --no-git-tag-version` (it only edits `package.json`; `pnpm version` behaves differently
   across pnpm versions, so do not use it). While the major is `0`, a `minor` bump may break the API.
   Commit `chore(release): vX.Y.Z`, open a PR against `master` and merge it.
2. **Sync**: `git switch master && git pull --ff-only`. The tree must be clean.
3. **Verify**: `pnpm install --frozen-lockfile && pnpm verify && pnpm smoke:package`.
4. **Look at what will ship**: `pnpm pack --pack-destination /tmp/ck && tar -tzf /tmp/ck/choropleth-kit-X.Y.Z.tgz`.
   Expected: `dist/` without sourcemaps, `README.md`, `LICENSE`, `package.json`.
5. **Publish**: `pnpm publish` (`publishConfig` already sets `access: public`). It runs `prepublishOnly`
   (`pnpm verify`) and asks for the one-time code.
6. **Check** <https://www.npmjs.com/package/choropleth-kit> and, in a scratch project, `npm i choropleth-kit`.
7. **Tag the published commit** (after publishing, so the tag always means "this is what npm has"):
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
8. **GitHub Release**: `gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --generate-notes`
   (add `--prerelease` for betas).

## Pre-releases

Publish risky changes under a tag so `npm i choropleth-kit` keeps installing the stable one:

```bash
npm version 0.2.0-beta.0 --no-git-tag-version
pnpm publish --tag beta          # users opt in with: npm i choropleth-kit@beta
gh release create v0.2.0-beta.0 --verify-tag --prerelease --generate-notes
```

Never publish a version twice: a bad one is deprecated and superseded.

## When something goes wrong

- **Published a bad version:** you cannot overwrite a version. Publish a fixed one, and mark the bad one with
  `npm deprecate choropleth-kit@0.1.0 "use 0.1.1: <reason>"`.
- **`npm unpublish`** is only allowed within 72 hours of publishing (and not if other packages depend on it).
  Prefer `deprecate`.
- **The ownership code (OTP) does not arrive or fails:** check the 2FA app's clock; recovery codes are in your npm account settings.

## Later (see `evolution-and-issues/features/FEAT-015-production-v1.md`)

Publish from CI instead of your laptop, with **provenance** (npm's trusted publishing from GitHub Actions) and
`changesets` for versioning and changelogs.
