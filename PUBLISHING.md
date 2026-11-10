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

1. **Make sure everything is committed and on `master`** (pnpm refuses to publish from a dirty tree or
   from another branch unless you pass `--no-git-checks`).
2. **Bump the version** in `package.json`. Use `pnpm version patch|minor|major` (it also creates a git
   commit and tag), or edit the field by hand. While the major is `0`, treat `minor` as the breaking-change slot.
3. **Verify**: `pnpm verify` runs typecheck, lint, formatting, the tests, the build, `size-limit`, `publint`
   and `attw`. (`pnpm publish` runs it again through `prepublishOnly`.)
4. **Look at what will ship**: `pnpm pack --pack-destination /tmp/ck` and `tar -tzf /tmp/ck/choropleth-kit-*.tgz`.
   Expected: `dist/` without sourcemaps, `README.md`, `LICENSE`, `package.json`. To smoke-test it, install the
   `.tgz` in an empty project with `npm i /tmp/ck/choropleth-kit-<version>.tgz react react-dom`.
5. **Publish**: `pnpm publish --access public` (the package is unscoped, so `--access public` is optional but harmless).
   Enter the one-time code when asked.
6. **Check** <https://www.npmjs.com/package/choropleth-kit> and, in a scratch project, `npm i choropleth-kit`.
7. Push the commit and the tag: `git push && git push --tags`.

## Pre-releases

Publish risky changes under a tag so `npm i choropleth-kit` keeps installing the stable one:

```bash
pnpm version 0.2.0-beta.0
pnpm publish --tag beta          # users opt in with: npm i choropleth-kit@beta
```

## When something goes wrong

- **Published a bad version:** you cannot overwrite a version. Publish a fixed one, and mark the bad one with
  `npm deprecate choropleth-kit@0.1.0 "use 0.1.1: <reason>"`.
- **`npm unpublish`** is only allowed within 72 hours of publishing (and not if other packages depend on it).
  Prefer `deprecate`.
- **The ownership code (OTP) does not arrive or fails:** check the 2FA app's clock; recovery codes are in your npm account settings.

## Later (see `evolution-and-issues/features/FEAT-015-production-v1.md`)

Publish from CI instead of your laptop, with **provenance** (npm's trusted publishing from GitHub Actions) and
`changesets` for versioning and changelogs.
