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

function textLen(page) {
  const raw = page.body?.storage?.value || '';
  return raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().length;
}

const nodes = new Map();   // id -> {id, title, parent}
const children = new Map(); // id -> [childId]

async function crawl() {
  let frontier = [ROOT];
  children.set(ROOT, []);
  while (frontier.length) {
    const layer = await pool(frontier, 8, async (id) => (await directChildren(id)).map((c) => ({...c, parent: id})));
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
    has_body: body ? textLen(body) >= 40 : false,
    is_container: (children.get(id) || []).length > 0,
    marked: /AUTOMAT/i.test(n.title) || n.title.includes('\u{1F916}'),
  };
}).sort((a, b) => (a.section + a.title).localeCompare(b.section + b.title));

fs.writeFileSync(PATHS.registry, JSON.stringify({
  source: 'confluence', space: 'SET', root: ROOT,
  refreshed: new Date().toISOString().slice(0, 10),
  cases,
}, null, 1));
console.error(`[refresh] wrote ${cases.length} cases to data/confluence-cases.json`);
