# Superdesk QA automation coverage

A single-page dashboard mapping the Confluence "Superdesk QA Tests" tree to the Playwright e2e specs in the Superdesk repos, with coverage percentages, a progress-over-time chart, and two-way links (Confluence case <-> GitHub spec).

- **Live dashboard:** `index.html`, served via GitHub Pages at https://eos87.github.io/qa-hub/
- **Self-contained page:** no server, no runtime deps. Data is embedded at build time.

## How it works

The dashboard is regenerated, not hand-maintained. Two inputs:

1. **Spec annotations** (the source of truth for "automated"). Each e2e test declares which QA case it covers. See `CONVENTION.md`. `scripts/parse-annotations.mjs` extracts these from the spec repos.
2. **The Confluence case registry** (`data/confluence-cases.json`): every QA case with its title, section, and whether it has a documented body. This is the source of truth for "what tests exist".

`scripts/build.mjs` joins them: a case is automated iff a spec annotation references it; everything else in the registry is the backlog. It writes `index.html`, `data/coverage.json` (machine-readable), and appends a point to `data/history.jsonl`.

Backlog is derived (`registry minus annotated`), so there is no second list to maintain while Confluence stays the registry.

## Progress history

Every build appends one line to `data/history.jsonl` (date + the key counts), deduped so identical consecutive states collapse. Two records of progress:

- **git history** of `data/history.jsonl` and `data/coverage.json`: a durable, diffable trail of every change.
- **the trend chart** on the dashboard, rendered from `history.jsonl`.

The first point (2026-06-25) is a seeded baseline from the audit. Coverage then equals now because only annotations were added since, not new tests, so the line is flat until real automation lands. Every point after this is a genuine build.

## Automation (GitHub Actions)

- `.github/workflows/build.yml`: weekly + manual. Checks out the two spec repos, runs `build.mjs`, commits the regenerated `index.html` / `coverage.json` / `history.jsonl`. GitHub Pages (deploy-from-branch) serves the result.
- `.github/workflows/refresh-confluence.yml`: weekly + manual. Regenerates `data/confluence-cases.json` from Confluence via `scripts/refresh-confluence.mjs`. Needs repo secrets `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN` (an Atlassian API token). Kept separate so the dashboard build never depends on Confluence auth.

## Run locally

```bash
# point at local checkouts of the spec repos (or set REPOS_DIR to a folder of checkouts)
mkdir -p repos
ln -s /path/to/superdesk-client-core repos/superdesk-client-core
ln -s /path/to/superdesk-planning   repos/superdesk-planning
npm run build      # regenerates index.html + data/*
```

Node 20+ (uses global fetch for the Confluence refresh; the dashboard build itself runs on 16+).

## Status

Personal staging repo. Live pass/fail (green/red per test from CI runs) is not wired yet; the dashboard currently shows coverage status from annotations, not last-run result. Moving to a Superdesk-org hub later.
