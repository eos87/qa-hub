import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {REPOS, REPOS_DIR} from './config.mjs';

const ANNOTATION = /type:\s*['"]confluence['"]\s*,\s*description:\s*['"](\d+)\s+(complete|partial)['"]/;
// `description: \`${row.caseId} complete\`` inside a loop over a table of cases; the ids
// are the `caseId: '<id>'` entries of the same file.
const TEMPLATE_ANNOTATION = /type:\s*['"]confluence['"]\s*,\s*description:\s*`\$\{[\w.]+\.(\w+)\}\s+(complete|partial)`/;
const TEST_DECL = /^\s*test(?:\.(?:only|skip|fixme))?\s*\(|^\s*test\.describe\s*\(/;
const TITLE = /['"`]([^'"`]*)['"`]/;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      out.push(...walk(p));
    } else if (e.name.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

function idsOfProperty(lines, prop) {
  const re = new RegExp(`\\b${prop}:\\s*['"](\\d+)['"]`);
  return [...new Set(lines.map((ln) => ln.match(re)?.[1]).filter(Boolean))];
}

// Pin GitHub links to a pushed commit. Locally HEAD may be an unmerged
// annotation branch, so prefer the remote-tracking branch; in CI (detached
// checkout of the branch) origin/<branch> is absent and HEAD is the real tip.
function shaOf(repoRoot, branch) {
  const refs = [branch && `origin/${branch}`, 'HEAD'].filter(Boolean);
  for (const ref of refs) {
    try {
      return execFileSync('git', ['-C', repoRoot, 'rev-parse', ref], {encoding: 'utf8'}).trim();
    } catch {}
  }
  return 'HEAD';
}

// Nearest enclosing test()/test.describe() at or above the annotation line.
function enclosingTest(lines, annIdx) {
  for (let i = annIdx; i >= 0; i--) {
    if (TEST_DECL.test(lines[i])) {
      const m = lines[i].match(TITLE);
      return {line: i + 1, title: m ? m[1] : ''};
    }
  }
  return {line: annIdx + 1, title: ''};
}

export function parseAnnotations() {
  const repos = {};
  const annotations = [];
  for (const r of REPOS) {
    const root = path.join(REPOS_DIR, r.dir);
    if (!fs.existsSync(root)) {
      console.warn(`[parse] repo not found, skipping: ${root}`);
      continue;
    }
    repos[r.name] = {sha: shaOf(root, r.branch), owner: r.owner, repo: r.repo};
    const specRoot = path.join(root, r.specDir);
    if (!fs.existsSync(specRoot)) continue;
    for (const file of walk(specRoot)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const relToRepo = path.relative(root, file);
      lines.forEach((ln, i) => {
        const literal = ln.match(ANNOTATION);
        const template = literal ? null : ln.match(TEMPLATE_ANNOTATION);
        if (!literal && !template) return;
        const ids = literal ? [literal[1]] : idsOfProperty(lines, template[1]);
        if (ids.length === 0) {
          console.warn(`[parse] no ids found for ${relToRepo}:${i + 1}`);
        }
        const level = (literal ?? template)[2];
        const host = enclosingTest(lines, i);
        for (const id of ids) {
          annotations.push({
            id,
            level,
            repo: r.name,
            file: relToRepo,
            line: host.line,
            testTitle: host.title,
          });
        }
      });
    }
  }
  return {repos, annotations};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = parseAnnotations();
  console.log(JSON.stringify(out, null, 1));
  console.error(`parsed ${out.annotations.length} annotations across ${Object.keys(out.repos).length} repos`);
}
