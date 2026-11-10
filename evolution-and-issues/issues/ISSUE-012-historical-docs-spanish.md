# ISSUE-012 · Two historical documents are still in Spanish

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Language decision at the close of the MVP: everything in English.

## What happens

Everything shipped or maintained going forward is in English (library, comments, stories, tests, READMEs, `evolution-and-issues/`). The two big MVP documents were **not** translated: `choropleth-build-proccess.md` (the build diary, ~3,300 lines) and `coropleth-library.md` (the design document, `dd.md`, ~2,500 lines).

## Options

- Leave them as a historical record in Spanish (current state; `AGENTS.md` says so).
- Translate `dd.md` (it is still cited from code comments as `dd.md §N`) and keep the diary as history.
- Move the useful parts into the future docs site (FEAT-014) in English and archive both.

## Pending decision

Which option. Until then, comments citing `dd.md §N` point to a Spanish document.
