# QA case annotation convention

How Playwright e2e tests in the Superdesk repos declare which Confluence QA
cases they cover. The hub parses these annotations (no LLM) to regenerate the
coverage dashboard and to derive the not-automated backlog
(`Confluence cases` minus `annotated cases`).

## The annotation

Add an `annotation` array to the `test(...)` (or `test.describe(...)`) that
covers a QA case. One entry per case:

```ts
test('reverting to a previous article version', {
    annotation: [
        {type: 'confluence', description: '1308524929 complete'}, // Revert to a previous version
    ],
}, async ({page}) => {
    // ...
});
```

- **type**: the source platform, `confluence`. This is deliberately the
  platform name, not `qa-case`: if the QA cases ever move to another tool, the
  migration is a swap of `type` plus the ids, nothing else.
- **description**: `<confluencePageId> <level>` where level is `complete` or `partial`.
  - `<confluencePageId>` is the page id in the "Superdesk QA Tests" tree
    (space `SET`). URL: `https://sofab.atlassian.net/wiki/spaces/SET/pages/<id>`.
  - `complete` = the test fully exercises the documented scenario.
  - `partial` = the test covers only part of it.
  - Level rides in the description (not its own field) because Playwright's
    annotation is typed `{type, description}` only, and because coverage is
    per (test, case): the same test can be `complete` for one case and
    `partial` for another.
- The trailing `// <title>` comment is recommended: it makes the link readable
  in review. The parser ignores it; the hub gets the real title from Confluence.

Playwright surfaces these in the HTML report (`confluence: 1308524929 complete`),
so QAs watching a run can see the case link too.

## Many-to-many

- **One test covers several cases:** add several `confluence` entries.
- **One case is covered by several tests** (each contributing a part): annotate
  each contributing test with that id and `partial`.
- **A whole describe block maps to a case:** annotate the `test.describe(...)`
  the same way (options object as the 2nd argument).

## Rules the hub enforces

- Every `confluence` annotation id must exist in the Confluence tree (catches
  typos and deleted pages). Fails CI otherwise.
- A given id should carry `complete` in at most one place. Multiple `partial`
  references are fine; mixing `complete` and `partial` for the same id warns.
- A case is "automated" iff at least one `confluence` annotation references it.
  Everything else in Confluence is the backlog. There is no separate list to
  maintain while Confluence remains the registry.

## When you automate a previously-manual case

Just add the annotation in the same PR as the new/changed spec. On the next hub
build the case moves from the backlog to automated automatically. Nothing else
to touch.
