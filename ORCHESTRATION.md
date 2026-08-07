# Automation campaign: orchestrator brief

How to drive a session that automates the Confluence QA backlog at scale. Hand this to the orchestrator agent as its brief.

## The model

One work unit = one backlog case -> one annotated Playwright spec -> one PR. History is never written by the automation session; it falls out of the hub reading develop. The loop:

```
backlog case -> leaf agent (skill authors spec + annotation) -> PR -> human review/merge
             -> develop gains an annotation -> manual "Build coverage dashboard" run -> history point
```

The annotation is the only connective piece. Every automation PR must carry it, or the dashboard won't count the case.

## Prerequisites (all met)

- Baseline annotations are merged to develop (172 cases). The dashboard builds off develop.
- The work queue is `data/backlog.json` in this repo, regenerated on every build. Fields per case: `id`, `title`, `section`, `url`, `suggested_repo`.
- The `superdesk-e2e` skill supports concurrent e2e slots.

## The leaf agent (one per case)

Fill this template per case from `data/backlog.json`:

```
Automate ONE Superdesk QA case as a Playwright e2e spec.

CASE
  id:      <id>
  title:   <title>
  section: <section>
  url:     <url>
  repo:    <suggested_repo>     # confirm from the actual feature, not just the section

DO
  1. Fetch the scenario from Confluence for the exact steps + expected results:
       acli confluence auth switch --site sofab.atlassian.net
       acli confluence page view --id <id> --body-format storage
  2. Author the spec with the superdesk-e2e skill in <repo>. Iterate to a DETERMINISTIC pass
     (run it 3x); keep the trace artifact. Do not settle for a flaky test.
  3. Annotate the test per CONVENTION.md, in the test's details object:
       {type: 'confluence', description: '<id> complete'}   // <title>
     Use 'partial' if the spec only covers part of the scenario; note the gap.
     KEEP THE ANNOTATION LINE UNDER 120 CHARS. If the `// title` comment would overflow,
     put the comment on its own line above the annotation. (Lint enforces max-len 120; a
     long inline comment is the one thing that reliably reddens CI.)
  4. Branch hg/automate-<kebab-slug> OFF develop. Commit "Automate <title> (<id>)".
     Open a PR against develop; link the Confluence case and attach the trace.
  5. If it cannot be made deterministic (feature absent, inherently flaky), STOP and mark it
     PARKED with the reason. Never force a flaky test.

RETURN (structured)
  { id, repo, spec_file, coverage: complete|partial|parked|failed, pr_url, notes }
```

## The orchestrator

```
1. Load data/backlog.json. Apply run config: { sections|ids to target, maxCases, skip[], priority }.
2. Fan out leaf agents, each in its OWN git worktree (isolation: 'worktree') so parallel spec
   authoring never collides on branches/files. Cap concurrency at the number of e2e slots.
3. Run the leaf template per case. Collect the structured results.
4. Emit a run report: attempted, PRs opened (links), partial, parked (reasons), failed.
   Do NOT merge PRs. Do NOT touch the dashboard or history. Humans review; merging moves the numbers.
```

Two correctness musts: **worktree isolation per agent** (concurrent slots handle the stack/ports, but git needs separate worktrees), and **branch off develop** (every PR independently mergeable).

## Conventions the PRs must follow

- Annotation: `{type: 'confluence', description: '<id> complete|partial'}` on the test details object, line under 120 chars (comment above if long). See `CONVENTION.md`.
- Branch: `hg/automate-<kebab-slug>` off develop.
- Repo routing: planning sections (planning / events / assignments / agendas) -> `superdesk-planning`; everything else -> `superdesk-client-core`. The agent confirms from the feature.
- One case per PR (small, reviewable). New specs are new files, so PRs don't conflict with each other or the baseline.

## Recording progress (manual, for now)

History is derived from develop, so after PRs merge:

```
gh workflow run "Build coverage dashboard" -R eos87/qa-hub
```

It reads develop, recomputes, and appends a history point if coverage changed (deduped; one point per day, same-date replaced). Run it after a merge or a batch of merges. No local checkouts to sync.

## Pilot before scale

Do not point the orchestrator at all of `backlog.json` on day one. Run ~5 cases end to end first: authored, annotated, PR green, merge one, run the build, watch the number tick up. That validates the leaf prompt and the whole loop before committing slots to a large batch. Then fan out in batches with human review gating every merge.
