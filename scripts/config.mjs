import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HUB = path.resolve(here, '..');

// Where the spec repos are checked out. CI checks them out under ./repos/<dir>.
// Locally, point REPOS_DIR at a folder of checkouts (or symlinks).
export const REPOS_DIR = process.env.REPOS_DIR
  ? path.resolve(process.env.REPOS_DIR)
  : path.join(HUB, 'repos');

export const CONFLUENCE_BASE = 'https://sofab.atlassian.net/wiki/spaces/SET/pages/';

export const REPOS = [
  {
    name: 'client-core',
    owner: 'superdesk',
    repo: 'superdesk-client-core',
    dir: 'superdesk-client-core',
    specDir: 'e2e/client/playwright',
    branch: 'develop',
  },
  {
    name: 'planning',
    owner: 'superdesk',
    repo: 'superdesk-planning',
    dir: 'superdesk-planning',
    specDir: 'e2e/playwright',
    branch: 'develop',
  },
];

export const PATHS = {
  registry: path.join(HUB, 'data', 'confluence-cases.json'),
  coverage: path.join(HUB, 'data', 'coverage.json'),
  history: path.join(HUB, 'data', 'history.jsonl'),
  template: path.join(HUB, 'scripts', 'lib', 'template.html'),
  index: path.join(HUB, 'index.html'),
};
