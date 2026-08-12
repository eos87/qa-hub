import fs from 'node:fs';
import path from 'node:path';
import {PATHS, CONFLUENCE_BASE, PLANNING_SECTION} from './config.mjs';
import {parseAnnotations} from './parse-annotations.mjs';

const registry = JSON.parse(fs.readFileSync(PATHS.registry, 'utf8')).cases;
const {repos, annotations} = parseAnnotations();

const byId = new Map();
for (const a of annotations) {
  if (!byId.has(a.id)) byId.set(a.id, []);
  byId.get(a.id).push(a);
}

const registryIds = new Set(registry.map((c) => c.id));
const unknownIds = [...new Set(annotations.map((a) => a.id))].filter((id) => !registryIds.has(id));
if (unknownIds.length) {
  console.warn(`[build] WARNING: ${unknownIds.length} annotation id(s) not in the Confluence registry: ${unknownIds.join(', ')}`);
}

function specLink(ann) {
  const r = repos[ann.repo];
  if (!r) return {label: path.basename(ann.file) + ':' + ann.line, url: null};
  const url = `https://github.com/${r.owner}/${r.repo}/blob/${r.sha}/${ann.file}#L${ann.line}`;
  return {label: path.basename(ann.file) + ':' + ann.line, url};
}

const rows = registry.map((c) => {
  const anns = byId.get(c.id) || [];
  let cls, group, conf = '', specLabel = null, specUrl = null, notes = '';
  if (c.is_container) {
    cls = 'container';
    group = 'section';
  } else if (anns.length) {
    const level = anns.some((a) => a.level === 'complete') ? 'complete' : 'partial';
    conf = level;
    group = 'auto';
    if (!c.has_body) cls = 'not_documented_code_exists';
    else cls = level === 'complete' ? 'automated_complete' : 'automated_partial';
    const sl = specLink(anns[0]);
    specLabel = sl.label;
    specUrl = sl.url;
    notes = [...new Set(anns.map((a) => a.testTitle).filter(Boolean))].join(' / ');
  } else {
    group = 'manual';
    cls = c.has_body ? 'not_automated' : 'not_documented';
  }
  return {
    id: c.id, title: c.title, section: c.section, cls, group, conf,
    repo: anns[0]?.repo || '', conf_url: c.url || CONFLUENCE_BASE + c.id,
    spec_label: specLabel, spec_url: specUrl, notes, marked: !!c.marked,
  };
});

const count = (cl) => rows.filter((r) => r.cls === cl).length;
const metrics = {
  total: rows.length,
  containers: count('container'),
  real: rows.filter((r) => r.cls !== 'container').length,
  complete: count('automated_complete'),
  partial: count('automated_partial'),
  undoc_code: count('not_documented_code_exists'),
  manual_doc: count('not_automated'),
  manual_empty: count('not_documented'),
  stale: 0,
  sha_cc: (repos['client-core']?.sha || '').slice(0, 9),
  sha_pl: (repos['planning']?.sha || '').slice(0, 9),
};

const date = process.env.SNAPSHOT_DATE || new Date().toISOString().slice(0, 10);
const point = {
  date,
  real: metrics.real,
  complete: metrics.complete,
  partial: metrics.partial,
  undoc_code: metrics.undoc_code,
  not_automated: metrics.manual_doc,
  not_documented: metrics.manual_empty,
  automated_any: metrics.complete + metrics.partial + metrics.undoc_code,
};

let history = [];
if (fs.existsSync(PATHS.history)) {
  history = fs.readFileSync(PATHS.history, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const same = (a, b) => a && ['real', 'complete', 'partial', 'undoc_code', 'not_automated', 'not_documented']
  .every((k) => a[k] === b[k]);
const last = history[history.length - 1];
if (!same(last, point)) {
  if (last && last.date === point.date) history[history.length - 1] = point;
  else history.push(point);
  fs.writeFileSync(PATHS.history, history.map((h) => JSON.stringify(h)).join('\n') + '\n');
  console.error(`[build] history point recorded for ${date}`);
} else {
  console.error('[build] no metric change since last point; history unchanged');
}

fs.writeFileSync(PATHS.coverage, JSON.stringify({
  generated: date, repos, metrics, unknownIds, rows,
}, null, 1));

// The automation backlog: documented QA cases with no e2e spec yet. This is the
// orchestrator's work queue; regenerated every build so it never goes stale.
const backlog = rows.filter((r) => r.cls === 'not_automated').map((r) => ({
  id: r.id, title: r.title, section: r.section, url: r.conf_url,
  suggested_repo: PLANNING_SECTION.test(r.section) ? 'superdesk-planning' : 'superdesk-client-core',
}));
fs.writeFileSync(PATHS.backlog, JSON.stringify({
  generated: date, count: backlog.length,
  note: 'not_automated documented QA cases = the automation backlog (suggested_repo is a hint; confirm from the feature)',
  cases: backlog,
}, null, 1));

let testdefs = [];
try { testdefs = JSON.parse(fs.readFileSync(PATHS.testdefs, 'utf8')).series || []; } catch {}

const tmpl = fs.readFileSync(PATHS.template, 'utf8');
const html = tmpl
  .replace('__ROWS__', JSON.stringify(rows))
  .replace('__METRICS__', JSON.stringify(metrics))
  .replace('__HISTORY__', JSON.stringify(history))
  .replace('__TESTDEFS__', JSON.stringify(testdefs))
  .replace('__SHACC__', metrics.sha_cc || 'n/a')
  .replace('__SHAPL__', metrics.sha_pl || 'n/a')
  .replace('__GENERATED__', date);
fs.writeFileSync(PATHS.index, html);

console.error(`[build] rows=${rows.length} automated_any=${point.automated_any}/${metrics.real} (complete=${metrics.complete} partial=${metrics.partial} undoc=${metrics.undoc_code}) -> index.html`);
