import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { get as httpGet } from 'node:http';
import { collectDependencyGraph, validateDependencyGraph } from '../src/dependency-graph.mjs';
import { runScan } from '../src/runner.mjs';
import { writeReports } from '../src/reports.mjs';
import { startDashboard } from '../src/dashboard/server.mjs';

async function sandbox(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'sec-hub-graph-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

const writeLock = (root, lock, name = 'package-lock.json') => writeFile(path.join(root, name), JSON.stringify(lock));
function getJson(url) {
  return new Promise((resolve, reject) => httpGet(url, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
  }).on('error', reject));
}

test('collects every npm lockfile package and resolves nested and peer edges to installed package entries', async () => sandbox(async root => {
  await writeLock(root, {
    name: 'demo', lockfileVersion: 3,
    packages: {
      '': { name: 'demo', version: '1.0.0', dependencies: { alpha: '^1', host: '^2' } },
      'node_modules/alpha': { version: '1.1.0', dependencies: { child: '^2' }, peerDependencies: { host: '^2' } },
      'node_modules/alpha/node_modules/child': { version: '2.0.0' },
      'node_modules/host': { version: '2.1.0' },
      'node_modules/orphan': { version: '9.0.0' },
    },
  });
  const graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'complete');
  assert.equal(graph.nodes.length, 5);
  assert.deepEqual(graph.edges.map(({ from, to, kind }) => [from, to, kind]).sort(), [
    ['.', 'node_modules/alpha', 'dependency'],
    ['.', 'node_modules/host', 'dependency'],
    ['node_modules/alpha', 'node_modules/alpha/node_modules/child', 'dependency'],
    ['node_modules/alpha', 'node_modules/host', 'peerDependency'],
  ].sort());
  assert.ok(graph.nodes.some(node => node.id === 'node_modules/orphan'));
}));

test('npm-shrinkwrap is authoritative and preserves workspace links as installed graph nodes', async () => sandbox(async root => {
  await writeLock(root, { lockfileVersion: 3, packages: { '': {}, 'node_modules/wrong': { version: '1.0.0' } } });
  await writeLock(root, { lockfileVersion: 3, packages: {
    '': { name: 'workspace-root', workspaces: ['packages/*'], dependencies: { app: '*' } },
    'node_modules/app': { resolved: 'packages/app', link: true },
    'packages/app': { name: 'app', version: '2.0.0', dependencies: { shared: '*' } },
    'node_modules/shared': { version: '3.0.0' },
  } }, 'npm-shrinkwrap.json');
  const graph = await collectDependencyGraph(root);
  assert.deepEqual(graph.lockfiles.map(file => file.path), ['npm-shrinkwrap.json']);
  assert.equal(graph.status, 'complete');
  assert.ok(graph.nodes.some(node => node.id === 'node_modules/app' && node.kind === 'workspace-link'));
  assert.ok(graph.nodes.some(node => node.id === 'packages/app' && node.kind === 'workspace'));
  assert.ok(graph.edges.some(edge => edge.from === 'packages/app' && edge.to === 'node_modules/shared'));
}));

test('reports missing, unsupported, malformed and oversized lockfile coverage without throwing', async () => sandbox(async root => {
  let graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'unavailable');
  assert.match(graph.limitations.join(' '), /npm|lockfile/i);
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0');
  graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'partial');
  assert.match(graph.limitations.join(' '), /pnpm/i);
  await writeLock(root, { lockfileVersion: 1, dependencies: {} });
  graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'partial');
  assert.match(graph.limitations.join(' '), /v1|v2|v3/i);
  await writeFile(path.join(root, 'package-lock.json'), '{');
  graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'partial');
  assert.match(graph.limitations.join(' '), /invalid|parse/i);
}));

test('does not follow a lockfile symlink or read beyond the configured byte ceiling', async () => sandbox(async root => {
  const outside = path.join(root, 'outside.json');
  await writeFile(outside, JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/leak': { version: '1' } } }));
  await symlink(outside, path.join(root, 'package-lock.json'));
  let graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(graph), /node_modules\/leak/);
  await rm(path.join(root, 'package-lock.json'));
  await writeFile(path.join(root, 'package-lock.json'), ' '.repeat(1024 * 1024 + 1));
  graph = await collectDependencyGraph(root, { maxBytes: 1024 * 1024 });
  assert.equal(graph.status, 'partial');
  assert.match(graph.limitations.join(' '), /size|limit/i);
}));

test('marks unsafe package paths, malformed specs and unsupported lockfile contents partial', async () => sandbox(async root => {
  await writeLock(root, { lockfileVersion: 3, packages: {
    '': { name: 'demo', dependencies: { bad: 42 } },
    'C:/Users/private/node_modules/leak': { name: 'leak', version: '1.0.0' },
    'node_modules/accepted/extra': { name: 'accepted', version: '1.0.0' },
  } });
  const graph = await collectDependencyGraph(root);
  assert.equal(graph.status, 'partial');
  assert.ok(graph.nodes.every(node => !node.path.startsWith('C:') && node.path !== 'node_modules/accepted/extra'));
  assert.equal(validateDependencyGraph(graph), true);
  assert.equal(validateDependencyGraph({ ...graph, status: 'complete', limitations: [], lockfiles: [{ path: 'package-lock.json', lockfileVersion: 1 }] }), false);
  assert.equal(validateDependencyGraph({ ...graph, token: 'should not pass' }), false);
}));

test('persists graph through run.json, reports, and catalog-ready saved run shape', async t => sandbox(async root => {
  await writeLock(root, { lockfileVersion: 3, packages: { '': { name: 'demo', dependencies: { alpha: '*' } }, 'node_modules/alpha': { version: '1.2.3' } } });
  const output = path.join(root, 'runs');
  const run = await runScan({ target: root, out: output, inspectGit: false, adapters: [], tools: [] });
  assert.equal(run.dependencyGraph.status, 'complete');
  assert.equal(validateDependencyGraph(JSON.parse(JSON.stringify(run.dependencyGraph))), true);
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(output, 'run.json'), 'utf8'));
  assert.deepEqual(saved.dependencyGraph, run.dependencyGraph);
  const reports = await writeReports(run, output);
  const json = JSON.parse(await (await import('node:fs/promises')).readFile(reports.json, 'utf8'));
  const sarif = JSON.parse(await (await import('node:fs/promises')).readFile(reports.sarif, 'utf8'));
  assert.deepEqual(json.dependencyGraph, run.dependencyGraph);
  assert.deepEqual(sarif.runs[0].properties.dependencyGraph, run.dependencyGraph);
  assert.match(await (await import('node:fs/promises')).readFile(reports.html, 'utf8'), /Dependency graph/);
  const dashboard = await startDashboard({ runs: output, port: 0 });
  try {
    const catalogResponse = await getJson(new URL('/api/catalog', dashboard.url));
    assert.equal(catalogResponse.status, 200, JSON.stringify(catalogResponse.body));
    const catalog = catalogResponse.body;
    const artifact = catalog.artifacts.find(item => item.kind === 'run');
    assert.ok(artifact.summary.dependencyGraph, JSON.stringify(artifact));
    assert.equal(artifact.summary.dependencyGraph.packageCount, 2);
    const detailResponse = await getJson(new URL(`/api/artifacts/${artifact.id}`, dashboard.url));
    assert.equal(detailResponse.status, 200);
    const detail = detailResponse.body;
    assert.deepEqual(detail.run.dependencyGraph, run.dependencyGraph);
  } finally { await dashboard.close(); await dashboard.closed; }
}));
