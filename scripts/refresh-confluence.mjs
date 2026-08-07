import fs from 'node:fs';
import {PATHS} from './config.mjs';

const SITE = process.env.CONFLUENCE_SITE || 'sofab.atlassian.net';
const EMAIL = process.env.CONFLUENCE_EMAIL;
const TOKEN = process.env.CONFLUENCE_API_TOKEN;
const ROOT = process.env.CONFLUENCE_ROOT || '1308524760';

if (!EMAIL || !TOKEN) {
  console.error('Missing CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN. Create a token at https://id.atlassian.com/manage-profile/security/api-tokens');
  process.exit(3);
}

const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');
const V2 = `https://${SITE}/wiki/api/v2`;

async function get(url) {
  const res = await fetch(url, {headers: {Authorization: AUTH, Accept: 'application/json'}});
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function directChildren(id) {
  const out = [];
  let url = `${V2}/pages/${id}/direct-children?limit=250`;
  while (url) {
    const j = await get(url);
    out.push(...(j.results || []));
    url = j._links?.next ? `https://${SITE}/wiki${j._links.next}` : null;
  }
  return out;
}

// Concurrency-limited map.
async function pool(items, limit, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (i < items.length) {
      const idx = i++;
      res[idx] = await fn(items[idx], idx);
    }
  }));
  return res;
}

// A page "has body" when it carries real prose, not just structure/navigation.
// Structural macros (pagetree/children/toc/jira) and links are stripped so that
// section pages that only list child pages or link out do not count as documented.
// Verified against a 47-page ground-truth sample; ~30 chars of remaining prose is
// the boundary between a real scenario/description and a bare note or redirect.
const HAS_BODY_MIN = 30;
const STRUCT = 'pagetree|children|detailssummary|toc|excerpt-include|include|content-report-table|contentbylabel|jira';

function proseLen(page) {
  let s = page.body?.storage?.value || '';
  if (!s) return 0;
  s = s.replace(new RegExp(`<ac:structured-macro[^>]*ac:name="(?:${STRUCT})"[^>]*>[\\s\\S]*?</ac:structured-macro>`, 'g'), ' ');
  s = s.replace(new RegExp(`<ac:structured-macro[^>]*ac:name="(?:${STRUCT})"[^>]*/>`, 'g'), ' ');
  s = s.replace(/<ac:link\b[^>]*>[\s\S]*?<\/ac:link>/g, ' ');
  s = s.replace(/<ac:image\b[^>]*>[\s\S]*?<\/ac:image>/g, ' ');
  s = s.replace(/<ri:[^>]+\/?>/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
       .replace(/&[a-z]+;/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  for (const b of ['Test cases', 'Related documentation', 'Test Cases']) s = s.split(b).join('');
  return s.trim().length;
}

const nodes = new Map();   // id -> {id, title, parent}
const children = new Map(); // id -> [childId]

async function crawl() {
  let frontier = [ROOT];
  children.set(ROOT, []);
  while (frontier.length) {
    const layer = await pool(frontier, 8, async (id) => {
      try {
        return (await directChildren(id)).map((c) => ({...c, parent: id}));
      } catch (e) {
        // Inaccessible pages (e.g. drafts) 404 on direct-children; treat them as leaves.
        console.warn(`[refresh] no children for ${id}: ${e.message}`);
        return [];
      }
    });
    const next = [];
    for (const kids of layer) {
      for (const k of kids) {
        if (nodes.has(k.id)) continue;
        nodes.set(k.id, {id: k.id, title: k.title, parent: k.parent});
        children.set(k.parent, [...(children.get(k.parent) || []), k.id]);
        next.push(k.id);
      }
    }
    frontier = next;
  }
}

function sectionOf(id) {
  let cur = id;
  while (nodes.get(cur)?.parent && nodes.get(cur).parent !== ROOT) cur = nodes.get(cur).parent;
  return nodes.get(cur)?.title || '';
}

console.error(`[refresh] crawling tree under ${ROOT} ...`);
await crawl();
const ids = [...nodes.keys()];
console.error(`[refresh] ${ids.length} pages; fetching bodies ...`);

const bodies = await pool(ids, 8, async (id) => {
  try {
    return await get(`${V2}/pages/${id}?body-format=storage`);
  } catch (e) {
    console.warn(`[refresh] body fetch failed for ${id}: ${e.message}`);
    return null;
  }
});

const cases = ids.map((id, k) => {
  const n = nodes.get(id);
  const body = bodies[k];
  return {
    id,
    title: n.title,
    section: sectionOf(id),
    url: `https://${SITE}/wiki/spaces/SET/pages/${id}`,
    has_body: body ? proseLen(body) >= HAS_BODY_MIN : false,
    is_container: (children.get(id) || []).length > 0,
    marked: /AUTOMAT/i.test(n.title) || n.title.includes('\u{1F916}'),
  };
}).sort((a, b) => (a.section + a.title).localeCompare(b.section + b.title));

// Compare against the previously committed registry: skip a no-op, report a real
// change, and refuse to publish a suspiciously large one (the signature of a logic
// or API regression, which is what caused silent has_body churn before).
let prevObj = {cases: [], refreshed: null};
try { prevObj = JSON.parse(fs.readFileSync(PATHS.registry, 'utf8')); } catch {}
const prev = prevObj.cases || [];
const pm = new Map(prev.map((c) => [c.id, c]));
const nm = new Map(cases.map((c) => [c.id, c]));
const added = cases.filter((c) => !pm.has(c.id));
const removed = prev.filter((c) => !nm.has(c.id));
const flips = cases.filter((c) => pm.has(c.id) && pm.get(c.id).has_body !== c.has_body);
const conts = cases.filter((c) => pm.has(c.id) && pm.get(c.id).is_container !== c.is_container);
const titles = cases.filter((c) => pm.has(c.id) && pm.get(c.id).title !== c.title);
const unchanged = prev.length && JSON.stringify(prev) === JSON.stringify(cases);

const head = `${cases.length} cases | changes vs committed: +${added.length}/-${removed.length} cases, ${flips.length} has_body, ${conts.length} container, ${titles.length} title`;
console.error(`[refresh] ${head}`);
for (const c of flips.slice(0, 40)) console.error(`   has_body ${pm.get(c.id).has_body} -> ${c.has_body}  ${c.title}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### Confluence registry refresh', '', `- ${head}`, ''];
  if (unchanged) md.push('_No changes; registry left untouched._');
  else if (flips.length) md.push('has_body changes:', ...flips.slice(0, 40).map((c) => `- \`${pm.get(c.id).has_body} -> ${c.has_body}\` ${c.title}`));
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
}

if (unchanged) {
  console.error('[refresh] no changes; registry left untouched (nothing to commit)');
} else {
  if (prev.length && (removed.length > 15 || flips.length > 60) && !process.env.FORCE) {
    console.error('[refresh] ABORT: change larger than expected (possible regression or API change). Nothing written. Re-run with FORCE=1 if the change is real.');
    process.exit(1);
  }
  fs.writeFileSync(PATHS.registry, JSON.stringify({
    source: 'confluence', space: 'SET', root: ROOT,
    refreshed: new Date().toISOString().slice(0, 10),
    cases,
  }, null, 1));
  console.error(`[refresh] wrote ${cases.length} cases to data/confluence-cases.json`);
}
