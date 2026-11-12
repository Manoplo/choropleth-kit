# ISSUE-005 · Disputed borders and regions without an id

- **Type:** Issue
- **Status:** done (policy documented, 2026-11-11)
- **Priority (proposed):** high
- **Origin:** Build diary, open questions; `dd.md §F.2` and §22.

## What happened

Northern Cyprus and Somaliland are left gray with no id; the other disputed borders are Natural Earth's.

## Policy (what the library does and promises)

- The bundled geometry (`choropleth-kit/geo`) is Natural Earth 1:110m, which draws _de facto_ boundaries.
  The library does not take a position on disputed borders.
- Northern Cyprus and Somaliland have no id and are painted as a non-interactive layer.
- The README («Geodata and borders») says so, warns that disputed borders are Natural Earth's and tells
  consumers they can pass their own geography through the `geography` prop.

## Left for later

A geodata variant with a different point of view is possible but not needed for `0.1.0`; it belongs to
[FEAT-015](../features/FEAT-015-production-v1.md) if someone asks for it.
