import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {REPOS, REPOS_DIR} from './config.mjs';

const ANNOTATION = /type:\s*['"]confluence['"]\s*,\s*description:\s*['"](\d+)\s+(complete|partial)['"]/;
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

function shaOf(repoRoot) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  } catch {
    return 'HEAD';
  }
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
    repos[r.name] = {sha: shaOf(root), owner: r.owner, repo: r.repo};
    const specRoot = path.join(root, r.specDir);
    if (!fs.existsSync(specRoot)) continue;
    for (const file of walk(specRoot)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const relToRepo = path.relative(root, file);
      lines.forEach((ln, i) => {
        const m = ln.match(ANNOTATION);
        if (!m) return;
        const host = enclosingTest(lines, i);
        annotations.push({
          id: m[1],
          level: m[2],
          repo: r.name,
          file: relToRepo,
          line: host.line,
          testTitle: host.title,
        });
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
