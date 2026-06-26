# Superdesk QA automation coverage

A single-page dashboard mapping the Confluence "Superdesk QA Tests" tree to the
Playwright e2e specs in the Superdesk repos, with coverage percentages and
two-way links (Confluence case <-> GitHub spec).

- **Live dashboard:** `index.html` (open locally or via GitHub Pages).
- **Self-contained:** no server, no build, no dependencies. All data is embedded.

## Status

This is a personal staging spot. The plan is to move it to a dedicated
`qa-coverage` hub repo under the Superdesk org once the approach is proven.

The current data is a **point-in-time snapshot** seeded from a one-off audit
(2026-06-25), pinned to:

- `superdesk-client-core` @ `012227d9`
- `superdesk-planning` @ `3905e8f1`

It reflects audit classification, not live CI pass/fail.

## Where this is going

1. Add `qa-case` / `qa-coverage` annotations to the e2e specs in each repo
   (the spec is the source of truth for "automated").
2. A GitHub Action parses those annotations, pulls the Confluence tree, derives
   the not-automated backlog (Confluence cases minus annotated), and regenerates
   this dashboard, including live pass/fail from the test run.

Until then, the dashboard is regenerated from the audit data.
