import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { categoryLabel, compactPath, comparisonControlState, dependencyGraphView, dependencyMapAvailable, filterArtifacts, filterFindings, findingAction, findingPackage, layoutDependencyGraph, reportedDependencyPackages, gateLabel, pageItems, runStatusLabel, sortFindingsBySeverity, toolStatusLabel, verificationLabel, transitionFindingView } from '../src/web/view-model.mjs';

const artifacts = [
  { id: 'a'.repeat(64), kind: 'run', state: 'ready', label: 'runs/one/run.json', summary: { runId: 'same', status: 'partial', target: { path: '/alpha' }, tools: [{ id: 'osv', status: 'imported' }] } },
  { id: 'b'.repeat(64), kind: 'run', state: 'ready', label: 'runs/two/run.json', summary: { runId: 'same', status: 'completed', target: { path: '/beta' }, tools: [{ id: 'semgrep', status: 'completed' }] } },
  { id: 'c'.repeat(64), kind: 'comparison', state: 'ready', label: 'comparison.json', summary: { baselineId: 'same', currentId: 'same', status: 'incomplete', target: { path: '/alpha' } } },
  { id: 'd'.repeat(64), kind: 'unknown', state: 'error', label: 'bad/run.json', error: { code: 'invalid_artifact' } },
];

function svgPathEnd(path) {
  const tokens = path.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  let index = 0; let command; let x = 0; let y = 0;
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    if (command === 'M') { x = Number(tokens[index++]); y = Number(tokens[index++]); command = 'L'; }
    else if (command === 'L') { x = Number(tokens[index++]); y = Number(tokens[index++]); }
    else if (command === 'H') x = Number(tokens[index++]);
    else if (command === 'V') y = Number(tokens[index++]);
    else if (command === 'C') { index += 4; x = Number(tokens[index++]); y = Number(tokens[index++]); }
    else throw new Error(`Unsupported SVG path command: ${command}`);
  }
  return { x, y };
}

test('filters intersect and search displayed text case-insensitively', () => {
  assert.deepEqual(filterArtifacts(artifacts, { query: 'ALPHA', kind: 'run', status: 'partial', tool: 'osv' }).map(x => x.id), ['a'.repeat(64)]);
  assert.deepEqual(filterArtifacts(artifacts, { query: 'same', kind: 'run', status: 'completed' }).map(x => x.id), ['b'.repeat(64)]);
  assert.deepEqual(filterArtifacts(artifacts, { kind: 'unknown', status: 'error' }).map(x => x.id), ['d'.repeat(64)]);
  assert.deepEqual(filterArtifacts(artifacts, { query: 'absent' }), []);
});

test('finding filtering intersects query, severity and tool', () => {
  const findings = [
    { severity: 'high', ruleId: 'RULE-A', toolId: 'osv', title: 'Package alpha', location: { path: 'lock.json' } },
    { severity: 'low', ruleId: 'RULE-B', toolId: 'osv', title: 'Package beta', location: { path: 'other.json' } },
    { severity: 'high', ruleId: 'RULE-C', toolId: 'semgrep', title: 'Code gamma', location: 'src/app.js' },
  ];
  assert.deepEqual(filterFindings(findings, { query: 'ALPHA', severity: 'high', tool: 'osv' }), [findings[0]]);
  assert.deepEqual(filterFindings(findings, { severity: 'high', tool: 'osv' }), [findings[0]]);
});

test('pagination clamps and caps the page size at 100', () => {
  const all = Array.from({ length: 245 }, (_, i) => i);
  assert.deepEqual(pageItems(all, 2, 50), { items: all.slice(50, 100), page: 2, pages: 5, total: 245 });
  assert.deepEqual(pageItems(all, 99), { items: all.slice(200), page: 3, pages: 3, total: 245 });
  assert.equal(pageItems(all, 1, 500).items.length, 100);
  assert.deepEqual(pageItems([], -1), { items: [], page: 1, pages: 1, total: 0 });
});

test('status, gate, category and verification labels preserve source semantics', () => {
  assert.equal(gateLabel(0), '비교 완료 · 기준 통과');
  assert.equal(gateLabel(1), '비교 완료 · 기준 위반');
  assert.equal(gateLabel(2), '범위 불충분 · 판단 불가');
  assert.equal(categoryLabel('new'), '새로 관측');
  assert.equal(categoryLabel('unobserved'), '범위 부족 · 미관측');
  assert.equal(runStatusLabel('completed'), '실행 완료');
  assert.equal(runStatusLabel('partial'), '부분 완료');
  assert.equal(toolStatusLabel('imported'), '가져온 결과 · 로컬 실행 아님');
  assert.equal(verificationLabel('candidate'), '후보');
  assert.equal(verificationLabel(undefined), '보고됨 · 검증 수준 미기록');
});

test('comparison controls stay frozen while a request is pending', () => {
  assert.deepEqual(comparisonControlState(true, true), { inputsDisabled: true, compareDisabled: true });
  assert.deepEqual(comparisonControlState(true, false), { inputsDisabled: true, compareDisabled: true });
  assert.deepEqual(comparisonControlState(false, true), { inputsDisabled: false, compareDisabled: false });
  assert.deepEqual(comparisonControlState(false, false), { inputsDisabled: false, compareDisabled: true });
});

test('compact path presentation retains exact Windows, POSIX, Unicode and HTML-like source strings', () => {
  const paths = [
    String.raw`C:\workspace\deep-parent-directory\saved-result-folder\nested-package\package-lock.json`,
    '/workspace/deep-parent-directory/saved-result-folder/nested-package/package-lock.json',
    '/사용자/아주-긴-부모-경로/보존해야-하는-검사-폴더/유니코드-경로/📄-원본-결과.json',
    '/workspace/<img src=x onerror=alert(1)>/long-parent-directory/another-folder/report.json',
  ];
  for (const full of paths) {
    const result = compactPath(full);
    assert.equal(result.full, full, 'full text must not normalize separators or escape source characters');
    assert.ok(result.summary.length < full.length, 'long path has a compact presentation');
    assert.ok(result.summary.includes(full.split(/[\\/]/).at(-1)), 'summary retains the filename');
  }
  assert.deepEqual(compactPath('src/app.js'), { summary: 'src/app.js', full: 'src/app.js' });
});

test('full parent paths remain searchable independently of compact presentation', () => {
  const full = '/workspace/searchable-parent-directory/another-long-directory/nested-package/package-lock.json';
  const finding = { severity: 'high', toolId: 'osv', title: 'Package', location: { path: full, line: 8 } };
  const original = structuredClone(finding);
  const result = compactPath(full);
  assert.equal(result.summary.includes('searchable-parent-directory'), false);
  assert.deepEqual(filterFindings([finding], { query: 'SEARCHABLE-PARENT-DIRECTORY', severity: 'high', tool: 'osv' }), [finding]);
  assert.deepEqual(filterFindings([finding], { query: 'searchable-parent-directory', severity: 'low', tool: 'osv' }), []);
  assert.deepEqual(filterFindings([finding], { query: 'absent' }), []);
  assert.deepEqual(finding, original, 'presentation and search leave saved data unchanged');
});

test('finding page clamps after filtering shrinks or removes all matches', () => {
  const findings = Array.from({ length: 125 }, (_, id) => ({ severity: id < 3 ? 'high' : 'low', toolId: 'osv', title: `Item ${id}` }));
  assert.equal(pageItems(findings, 2).items.length, 25);
  assert.deepEqual(pageItems(filterFindings(findings, { severity: 'high', tool: 'osv' }), 2), {
    items: findings.slice(0, 3), page: 1, pages: 1, total: 3,
  });
  assert.deepEqual(pageItems(filterFindings(findings, { query: 'absent', severity: 'high', tool: 'osv' }), 2), {
    items: [], page: 1, pages: 1, total: 0,
  });
});


test('compact labels stay shorter for a long single filename and keep Unicode characters whole', () => {
  const full = '📄'.repeat(49);
  const result = compactPath(full);
  assert.equal(result.full, full);
  assert.ok(Array.from(result.summary).length < Array.from(full).length);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result.summary));
});


test('raw Windows parent path search matches object locations without JSON escape artifacts', () => {
  const full = String.raw`C:\workspace\parent-directory\nested-package\package-lock.json`;
  const finding = { severity: 'high', toolId: 'osv', location: { path: full, line: 8 } };
  assert.deepEqual(filterFindings([finding], { query: String.raw`C:\workspace\parent-directory`, severity: 'high', tool: 'osv' }), [finding]);
  assert.deepEqual(filterFindings([finding], { query: full }), [finding]);
  assert.deepEqual(filterFindings([finding], { query: 'parent-directory', severity: 'high', tool: 'semgrep' }), []);
});


test('adversarial long path tokens finish within an isolated deadline and retain bounded summaries', () => {
  const moduleUrl = new URL('../src/web/view-model.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { compactPath } from ${JSON.stringify(moduleUrl)};
    const paths = [
      'x'.repeat(300_000),
      '/workspace/' + '📄'.repeat(150_000) + '/report.json',
      '/workspace/' + 'parent'.repeat(50_000) + '/' + 'file'.repeat(75_000),
    ];
    for (const full of paths) {
      const result = compactPath(full);
      assert.equal(result.full, full);
      assert.ok(Array.from(result.summary).length <= 72, 'collapsed summary stays bounded');
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 2000, encoding: 'utf8' });
  assert.equal(result.error?.code, undefined, 'long source tokens must not exhaust the isolated deadline');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(compactPath('/workspace/long-parent-directory/saved-result-folder/nested-package/package-lock.json').summary, '…/nested-package/package-lock.json');
});

// Catches stale evidence when filters exclude a selected source row, including duplicate IDs.
test('finding selection is scoped to matching source rows and filtering resets the page', () => {
  const findings = [{ id: 'same', title: '<img src=x>', severity: 'high', toolId: 'osv', location: String.raw`C:\원본\file.json` }, { id: 'same', title: 'Other', severity: 'low', toolId: 'semgrep' }];
  const state = { query: '', severity: 'all', tool: 'all', page: 2, selectedIndex: 0, locale: 'ko' };
  assert.deepEqual(transitionFindingView(findings, state, { severity: 'low' }), { ...state, severity: 'low', page: 1, selectedIndex: null });
  assert.equal(transitionFindingView(findings, state, { query: '원본' }).selectedIndex, 0);
  assert.equal(findings[0].title, '<img src=x>');
});

// Catches language changes clearing filters, selection or the current bounded page.
test('locale changes preserve finding view state and page changes keep selection', () => {
  const findings = Array.from({ length: 140 }, (_, i) => ({ title: `Item ${i}`, severity: 'high', toolId: 'osv' }));
  const state = { query: 'Item', severity: 'high', tool: 'osv', page: 2, selectedIndex: 125, locale: 'ko' };
  assert.deepEqual(transitionFindingView(findings, state, { locale: 'en' }), { ...state, locale: 'en' });
  assert.deepEqual(transitionFindingView(findings, state, { page: 99 }), { ...state, page: 2 });
});

// Catches accidental translation of unknown stored status/verification identifiers.
test('localized labels translate known semantics and retain unknown stored identifiers', () => {
  assert.equal(toolStatusLabel('imported', 'en'), 'Imported results · not a local execution');
  assert.equal(verificationLabel('candidate', 'en'), 'Candidate');
  assert.equal(toolStatusLabel('증거', 'en'), '증거');
  assert.equal(verificationLabel('증거', 'en'), '증거');
});

test('OSV display uses matched package evidence and a single version fix', () => {
  const finding = {
    toolId: 'osv',
    vulnerabilityId: 'GHSA-29mw-wpgm-hmr9',
    location: { package: 'npm:lodash', version: '4.17.20' },
    evidence: {
      package: { name: 'lodash', version: '4.17.20', ecosystem: 'npm' },
      affected: [
        { package: { name: 'lodash-es', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '5.0.0' }] }] },
        { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '4.0.0' }, { fixed: '4.17.21' }] }] },
      ],
    },
  };
  assert.deepEqual(findingPackage(finding), {
    name: 'lodash', version: '4.17.20', fixedVersion: '4.17.21',
    advisoryUrl: 'https://osv.dev/vulnerability/GHSA-29mw-wpgm-hmr9',
  });
  assert.deepEqual(filterFindings([finding], { query: '4.17.21' }), [finding]);
});

test('OSV display falls back to saved locations and omits ambiguous or absent fixes', () => {
  const location = { package: 'npm:@scope/package', version: '1.0.0' };
  const finding = { toolId: 'osv', location, description: 'Upgrade to 2.0.0' };
  assert.deepEqual(findingPackage(finding), { name: '@scope/package', version: '1.0.0' });
  for (const range of [
    { type: 'GIT', events: [{ introduced: '0' }, { fixed: 'e91d01c' }] },
    { type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '2.0.0' }, { introduced: '3.0.0' }] },
    { type: 'SEMVER', events: [{ introduced: '0' }, { last_affected: '2.0.0' }] },
  ]) {
    const evidence = { affected: [{ package: { name: '@scope/package', ecosystem: 'npm' }, ranges: [range] }] };
    assert.deepEqual(findingPackage({ ...finding, evidence }), { name: '@scope/package', version: '1.0.0' });
  }
  assert.deepEqual(findingPackage({ ...finding, toolId: 'semgrep' }), {});
});

test('OSV advisory links are canonical and use saved IDs, known legacy rule IDs, or canonical references', () => {
  assert.deepEqual(findingPackage({
    toolId: 'osv', references: ['javascript:alert(1)', 'https://example.com/advisory', 'https://osv.dev/vulnerability/GHSA-29mw-wpgm-hmr9'],
  }), { advisoryUrl: 'https://osv.dev/vulnerability/GHSA-29mw-wpgm-hmr9' });
  assert.deepEqual(findingPackage({
    toolId: 'osv', ruleId: 'GHSA-29mw-wpgm-hmr9',
  }), { advisoryUrl: 'https://osv.dev/vulnerability/GHSA-29mw-wpgm-hmr9' });
  assert.deepEqual(findingPackage({
    toolId: 'osv', ruleId: 'UI-000', vulnerabilityId: '../other',
    references: ['https://example.com/advisory', 'https://osv.dev/vulnerability/foo?redirect=x'],
  }), {});
});

test('finding severity sort preserves original order and row identity for equal ranks', () => {
  const findings = Object.freeze([
    { severity: 'high' }, { severity: 'low' }, { severity: 'custom' }, { severity: 'critical' },
    { severity: 'high' }, { severity: 'info' }, { severity: 'medium' }, { severity: 'unknown' },
  ]);
  const sorted = sortFindingsBySeverity(findings);
  [3, 0, 4, 6, 1, 5, 2, 7].forEach((index, i) => assert.equal(sorted[i], findings[index]));
});

test('finding actions use OSV even when saved affected ranges do not identify a fixed version', () => {
  const finding = {
    toolId: 'osv', description: 'Upgrade to 2.0.0.',
    location: { package: 'npm:example', version: '1.0.0' },
    evidence: { affected: [{
      package: { name: 'example', ecosystem: 'npm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { last_affected: '1.0.0' }] }],
    }] },
  };
  assert.deepEqual(findingAction(finding), { kind: 'dependency' });
  finding.evidence.affected[0].ranges[0].events[1] = { fixed: '1.1.0' };
  assert.deepEqual(findingAction(finding), { kind: 'dependency', fixedVersion: '1.1.0' });
});

test('PHP header results prompt runtime checks without accepting an advertised fix', () => {
  for (const patchStatus of ['unknown', 'potentially_vulnerable']) {
    const finding = { toolId: 'php2shell', evidence: { patchStatus, phpVersion: '8.2.34', fixedVersion: '9.0.0' } };
    assert.deepEqual(findingAction(finding), { kind: 'php' });
  }
});

test('code finding actions use source-specific guidance and leave saved suggestions as text', () => {
  for (const toolId of ['codex-security', 'skillspector']) {
    const finding = { toolId, verification: 'candidate', evidence: { remediation: 'Bind parameters.' } };
    const original = structuredClone(finding);
    assert.deepEqual(findingAction(finding), { kind: 'code', guidance: 'Bind parameters.' });
    assert.deepEqual(finding, original);
  }
  assert.deepEqual(findingAction({
    toolId: 'open-code-review', evidence: { existingCode: 'unsafe(input)', suggestionCode: '  validate("<value>");' },
  }), { kind: 'code', suggestion: '  validate("<value>");' });
  assert.deepEqual(findingAction({
    toolId: 'anthropic', evidence: { native: { recommendation: 'Reject invalid input.' } },
  }), { kind: 'code', guidance: 'Reject invalid input.' });
});

test('Cloudflare native actions carry the saved strategy and bounded code changes', () => {
  const finding = { toolId: 'cloudflare', evidence: { native: { remediation: {
    strategy: 'Validate caller authorization.',
    code_changes: [
      { file_name: '', fixed_code: 'ignore incomplete suggestion' },
      { file_name: 'src/auth.js', fixed_code: 'a'.repeat(5000) },
      { file_name: 'src/a.js', fixed_code: 'a' },
      { file_name: 'src/b.js', fixed_code: 'b' },
      { file_name: 'src/c.js', fixed_code: 'c' },
    ],
  } } } };
  const action = findingAction(finding);
  assert.equal(action.kind, 'code');
  assert.equal(action.guidance, 'Validate caller authorization.');
  assert.deepEqual(action.changes.map(({ path }) => path), ['src/auth.js', 'src/a.js', 'src/b.js']);
  assert.ok(action.changes[0].code.length <= 4000);
  assert.ok(action.changes[0].code.endsWith('…'));
});

test('finding actions fall back to review when evidence has no supported fix', () => {
  assert.deepEqual(findingAction({
    toolId: 'cloudflare', location: { path: 'src/app.js' },
    evidence: { native: { verdict: 'needs_validation' } },
  }), { kind: 'review' });
  assert.deepEqual(findingAction({
    toolId: 'anthropic', evidence: { importedEvidence: { recommendation: 'Unstructured contract data' } },
  }), { kind: 'review' });
  assert.deepEqual(findingAction({
    toolId: 'old-tool', remediation: 'Use safe parsing.',
  }), { kind: 'code', guidance: 'Use safe parsing.' });
  assert.deepEqual(findingAction({
    toolId: 'skillspector', description: 'No saved fix', evidence: { remediation: ['wrong shape'] },
  }), { kind: 'review' });
});


test('dependency packages group reported findings by ecosystem, name and version and retain saved source paths', () => {
  const findings = [
    { toolId: 'osv', evidence: { package: { ecosystem: 'npm', name: 'shared', version: '1.2.3' }, source: { path: 'first/package-lock.json' } } },
    { toolId: 'osv', location: { package: 'npm:shared', version: '1.2.3', path: 'second/package-lock.json' } },
    { toolId: 'osv', location: { package: 'npm:shared', version: '1.2.3', path: 'first/package-lock.json' } },
    { toolId: 'osv', location: { package: 'npm:shared', version: '2.0.0' } },
    { toolId: 'osv', location: { package: 'PyPI:shared', version: '1.2.3' } },
    { toolId: 'osv', location: { package: 'npm:shared' } },
    { toolId: 'other', evidence: { package: { name: 'outside-osv' } } },
    { toolId: 'osv', evidence: { affected: [{ package: { name: 'advisory-only' } }] } },
  ];
  assert.deepEqual(reportedDependencyPackages(findings), [
    { ecosystem: 'npm', name: 'shared', version: '1.2.3', sources: ['first/package-lock.json', 'second/package-lock.json'], findingIndices: [0, 1, 2] },
    { ecosystem: 'npm', name: 'shared', version: '2.0.0', sources: [], findingIndices: [3] },
    { ecosystem: 'PyPI', name: 'shared', version: '1.2.3', sources: [], findingIndices: [4] },
    { ecosystem: 'npm', name: 'shared', version: undefined, sources: [], findingIndices: [5] },
  ]);
});

test('dependency graph view uses recorded npm node identities and keeps workspace edges while filtering', () => {
  const graph = {
    schema: 'sec-hub.dependency-graph/v1', status: 'complete', ecosystem: 'npm',
    lockfiles: [{ path: 'package-lock.json', lockfileVersion: 3 }], limitations: [],
    nodes: [
      { id: '.', name: 'app', path: '' },
      { id: 'node_modules/shared', name: 'shared', version: '1.0.0', path: 'node_modules/shared' },
      { id: 'node_modules/app', name: 'app', version: '2.0.0', path: 'node_modules/app', kind: 'workspace-link' },
      { id: 'packages/app', name: 'app', version: '2.0.0', path: 'packages/app', kind: 'workspace' },
      { id: 'node_modules/other/node_modules/shared', name: 'shared', version: '2.0.0', path: 'node_modules/other/node_modules/shared' },
    ],
    edges: [
      { from: '.', to: 'node_modules/shared', kind: 'dependency', requested: '^1' },
      { from: '.', to: 'node_modules/app', kind: 'dependency' },
      { from: 'packages/app', to: 'node_modules/shared', kind: 'workspaceLink' },
      { from: 'node_modules/unknown', to: 'node_modules/shared', kind: 'dependency' },
      { from: '.', to: 'missing', kind: 'dependency' },
    ],
  };
  const view = dependencyGraphView(graph);
  assert.deepEqual(view.nodes.map(({ id }) => id), [
    'node_modules/shared', 'node_modules/app', 'packages/app', 'node_modules/other/node_modules/shared',
  ]);
  assert.deepEqual(view.edges.map(({ from, to, kind, relationship }) => [from, to, kind, relationship]), [
    ['.', 'node_modules/shared', 'direct', 'dependency'],
    ['.', 'node_modules/app', 'direct', 'dependency'],
    ['packages/app', 'node_modules/shared', 'transitive', 'workspaceLink'],
  ]);
  assert.equal('requested' in view.edges[0], false);
  assert.equal(view.allEdges.length, 3);
  assert.equal(view.root.id, '.');
  assert.equal(view.lockfiles[0].lockfileVersion, 3);
  assert.deepEqual(dependencyGraphView(graph, { query: '2.0.0' }).nodes.map(({ id }) => id), [
    'node_modules/app', 'packages/app', 'node_modules/other/node_modules/shared',
  ]);
  assert.deepEqual(dependencyGraphView(graph, { scope: 'transitive' }).nodes.map(({ id }) => id), ['node_modules/shared']);
  assert.equal(dependencyGraphView(undefined).status, 'unavailable');
  assert.equal(dependencyGraphView({ ...graph, schema: 'sec-hub.dependency-graph/v2' }).status, 'unavailable');
});

test('dependency graph search remains bounded for a large saved inventory', () => {
  const size = 3000;
  const nodes = [{ id: '.', name: 'large-app', path: '.', kind: 'project' }];
  const edges = [];
  for (let i = 0; i < size; i += 1) {
    const id = `node_modules/pkg-${i}`;
    nodes.push({ id, name: `pkg-${i}`, version: '1.0.0', path: id, kind: 'package' });
    edges.push({ from: i === 0 ? '.' : `node_modules/pkg-${i - 1}`, to: id, kind: i === 0 ? 'dependency' : 'optionalDependency' });
  }
  const graph = { schema: 'sec-hub.dependency-graph/v1', status: 'complete', ecosystem: 'npm', nodes, edges, lockfiles: [], limitations: [] };
  const full = dependencyGraphView(graph);
  assert.equal(full.totalNodes, size);
  assert.equal(full.tooLarge, true);
  assert.equal(full.nodes.length, size);
  const search = dependencyGraphView(graph, { query: 'pkg-2999' });
  assert.equal(search.nodes.length, 1);
  assert.equal(search.nodes[0].id, 'node_modules/pkg-2999');
  assert.equal(search.allEdges.length, size);
  assert.ok(search.allEdges.some((edge) => edge.to === 'node_modules/pkg-2999' && edge.from === 'node_modules/pkg-2998'));
  assert.equal(search.tooLarge, false);
});

test('dependency graph layout attaches forward, cycle, self and parallel edges within scroll bounds', () => {
  const nodes = [
    { id: '.', name: 'root', path: '.', kind: 'project' },
    { id: 'node_modules/a', name: 'a', path: 'node_modules/a', kind: 'package' },
    { id: 'node_modules/a/node_modules/b', name: 'b', path: 'node_modules/a/node_modules/b', kind: 'package' },
    { id: 'node_modules/a/node_modules/b/node_modules/c', name: 'c', path: 'node_modules/a/node_modules/b/node_modules/c', kind: 'package' },
    { id: 'node_modules/orphan', name: 'a very long orphan package name that should not affect the layout', path: 'node_modules/orphan', kind: 'package' },
    { id: 'node_modules/direct-peer', name: 'direct-peer', path: 'node_modules/direct-peer', kind: 'package' },
  ];
  const graph = dependencyGraphView({
    schema: 'sec-hub.dependency-graph/v1', status: 'complete', ecosystem: 'npm', nodes,
    edges: [
      { from: '.', to: nodes[1].id, kind: 'dependency' },
      { from: '.', to: nodes[5].id, kind: 'dependency' },
      { from: nodes[1].id, to: nodes[2].id, kind: 'dependency' },
      { from: nodes[1].id, to: nodes[2].id, kind: 'peerDependency' },
      { from: nodes[2].id, to: nodes[3].id, kind: 'optionalDependency' },
      { from: nodes[3].id, to: nodes[1].id, kind: 'dependency' },
      { from: nodes[2].id, to: nodes[2].id, kind: 'devDependency' },
      { from: nodes[1].id, to: nodes[5].id, kind: 'peerDependency' },
      { from: nodes[4].id, to: nodes[3].id, kind: 'dependency' },
    ], lockfiles: [], limitations: [],
  });
  const layout = layoutDependencyGraph(graph);
  assert.equal(layout.edges.length, 9, 'parallel and cyclic relationships are retained');
  assert.equal(layout.positions.get(nodes[1].id).level, 1);
  assert.equal(layout.positions.get(nodes[2].id).level, 2);
  assert.equal(layout.positions.get(nodes[3].id).level, 3);
  assert.equal(layout.positions.get(nodes[4].id).level, 1, 'unreachable nodes remain visible without being labeled direct');
  assert.equal(graph.allEdges.some((edge) => edge.to === nodes[4].id), false, 'the orphan has no recorded parent edge');
  const inside = ({ x, y }) => x >= 0 && y >= 0 && x <= layout.width && y <= layout.height;
  for (const rect of layout.positions.values()) {
    assert.ok(inside(rect));
    assert.ok(rect.x + rect.width <= layout.width);
    assert.ok(rect.y + rect.height <= layout.height);
  }
  for (const edge of layout.edges) {
    const from = layout.positions.get(edge.from);
    const to = layout.positions.get(edge.to);
    assert.ok(inside(edge.start)); assert.ok(inside(edge.end));
    assert.ok(edge.controls.every(inside), 'all path control points fit in the scroll viewBox');
    assert.ok(edge.path.startsWith(`M ${edge.start.x} ${edge.start.y}`));
    assert.deepEqual(svgPathEnd(edge.path), edge.end, 'SVG path endpoint equals the returned node boundary anchor');
    assert.ok(edge.end.y - layout.markerLength / 2 >= 0, 'open chevron stays inside the viewBox above the endpoint');
    assert.ok(edge.end.y + layout.markerLength / 2 <= layout.height, 'open chevron stays inside the viewBox below the endpoint');
    if (edge.route === 'forward') {
      assert.equal(edge.start.x, from.x + layout.nodeWidth, 'forward edge starts on source right boundary');
      assert.equal(edge.end.x, to.x - layout.arrowTipGap, 'forward marker tip leaves a small gap before the target border');
      assert.ok(edge.end.x - edge.controls.at(-1).x >= layout.markerLength + 1, 'forward edge has a short straight approach for its marker');
      assert.ok(edge.controls.at(-1).x < edge.end.x, 'forward chevron points right into the target');
    } else if (edge.route === 'back') {
      assert.equal(edge.start.x, from.x + layout.nodeWidth, 'back edge starts on source right boundary');
      assert.equal(edge.end.x, to.x + layout.nodeWidth + layout.arrowTipGap, 'back marker tip leaves a small gap beyond the target border');
      assert.ok(edge.end.x + layout.markerLength + 1 <= edge.controls.at(-1).x, 'back edge has a short straight approach for its left-pointing marker');
      assert.ok(edge.controls.at(-1).x > edge.end.x, 'back chevron points left into the target');
      assert.ok(edge.controls.some((point) => point.y > Math.max(from.y, to.y) + layout.nodeHeight), 'cycle edge takes a distinct outside lane');
    } else if (edge.route === 'skip') {
      assert.equal(edge.start.x, from.x + layout.nodeWidth);
      assert.equal(edge.end.x, to.x - layout.arrowTipGap);
      assert.ok(edge.end.x - edge.controls.at(-1).x >= layout.markerLength + 1);
      assert.ok(edge.controls.at(-1).x < edge.end.x, 'skip-level chevron points right into the target');
      assert.ok(edge.controls.some((point) => point.y > Math.max(from.y, to.y) + layout.nodeHeight), 'skip-level edge routes around intervening columns');
    } else {
      assert.equal(edge.start.x, from.x + layout.nodeWidth);
      assert.equal(edge.end.x, from.x + layout.nodeWidth + layout.arrowTipGap, 'self edge points back into the node with a small border gap');
      assert.ok(edge.end.x + layout.markerLength + 1 <= edge.controls.at(-1).x, 'self edge has a short terminal segment for its marker');
      assert.ok(edge.controls.at(-1).x > edge.end.x, 'self-edge chevron points left back into the node');
      assert.ok(edge.controls.every((point) => point.x > from.x + layout.nodeWidth), 'self edge stays outside the node and returns at its right border');
    }
  }
  const parallel = layout.edges.filter((edge) => edge.from === nodes[1].id && edge.to === nodes[2].id);
  assert.equal(parallel.length, 2);
  assert.notEqual(parallel[0].start.y, parallel[1].start.y, 'parallel edges use separate node ports');
  assert.ok(layout.width > 760, 'deep graphs keep intrinsic width for horizontal scrolling');
  assert.ok(layout.edges.some((edge) => edge.route === 'back' && edge.from === nodes[1].id && edge.to === nodes[5].id), 'same-level edge uses an outside route');
  assert.ok(layout.edges.some((edge) => edge.route === 'skip' && edge.from === nodes[4].id && edge.to === nodes[3].id), 'unreachable source to a deep target uses an outside route');
});

test('compact dependency layout fits a three-package chain without shrinking its node labels', () => {
  const nodes = [
    { id: '.', name: 'application', path: '.', kind: 'project' },
    { id: 'node_modules/express', name: 'express', version: '4.21.2', path: 'node_modules/express', kind: 'package' },
    { id: 'node_modules/express/node_modules/accepts', name: 'accepts', version: '1.3.8', path: 'node_modules/express/node_modules/accepts', kind: 'package' },
    { id: 'node_modules/express/node_modules/accepts/node_modules/ms', name: 'ms', version: '2.1.3', path: 'node_modules/express/node_modules/accepts/node_modules/ms', kind: 'package' },
  ];
  const graph = dependencyGraphView({
    schema: 'sec-hub.dependency-graph/v1', status: 'complete', ecosystem: 'npm', nodes,
    edges: [
      { from: '.', to: nodes[1].id, kind: 'dependency' },
      { from: nodes[1].id, to: nodes[2].id, kind: 'dependency' },
      { from: nodes[2].id, to: nodes[3].id, kind: 'dependency' },
    ], lockfiles: [], limitations: [],
  });
  const compact = layoutDependencyGraph(graph, { nodeWidth: 138, nodeHeight: 44, columnGap: 42, rowGap: 16, margin: 18 });
  assert.equal(compact.width, 714);
  assert.ok(compact.width <= 720, 'three package levels keep readable spacing and fit a moderate desktop view');
  assert.equal(compact.positions.get(nodes[3].id).x, 558);
  assert.ok(compact.columnGap >= compact.markerLength + 2, 'adjacent columns leave enough room for a smooth edge and arrowhead');
});

test('dependency map direct branches use smooth curves and spaced open chevrons at compact size', () => {
  const nodes = [
    { id: '.', name: 'application', path: '.', kind: 'project' },
    { id: 'node_modules/debug', name: 'debug', version: '4.4.0', path: 'node_modules/debug', kind: 'package' },
    { id: 'node_modules/lodash', name: 'lodash', version: '4.17.21', path: 'node_modules/lodash', kind: 'package' },
  ];
  const graph = { nodes, edges: [
    { from: '.', to: nodes[1].id, kind: 'direct', relationship: 'dependency' },
    { from: '.', to: nodes[2].id, kind: 'direct', relationship: 'dependency' },
  ] };
  const layout = layoutDependencyGraph(graph, { nodeWidth: 138, nodeHeight: 44, columnGap: 42, rowGap: 16, margin: 18 });
  assert.equal(layout.markerLength, 8, 'map arrows use a legible chevron marker');
  assert.equal(layout.markerPath, 'M 0 0 L 8 4 L 0 8', 'marker is a two-stroke open chevron with its tip on the path endpoint');
  assert.ok(Math.abs(layout.arrowTipGap - (2.5 + 1.8) / 2) < 1e-9, 'marker tip meets the selected border without covering it');
  assert.equal(layout.edges.length, 2);
  for (const edge of layout.edges) {
    const source = layout.positions.get(edge.from);
    const target = layout.positions.get(edge.to);
    assert.equal(edge.route, 'forward');
    assert.equal(edge.start.x, source.x + source.width);
    assert.equal(edge.end.x, target.x - layout.arrowTipGap);
    assert.ok(edge.end.x - edge.controls.at(-1).x >= 6, 'arrowhead gets a short straight approach');
    assert.match(edge.path, / H [\d.]+$/, 'curve ends in an explicit horizontal segment');
  }
  assert.ok(layout.edges[0].start.y !== layout.edges[0].end.y || layout.edges[1].start.y !== layout.edges[1].end.y, 'root branches curve toward the separate target rows');
});

test('a run with a dependency graph can open Dependency Map when it has no reported vulnerabilities', () => {
  const run = {
    dependencyGraph: {
      schema: 'sec-hub.dependency-graph/v1', status: 'complete', ecosystem: 'npm',
      nodes: Array.from({ length: 6 }, (_, index) => ({ id: `node_modules/pkg-${index}`, name: `pkg-${index}` })),
      edges: [], lockfiles: [{ path: 'package-lock.json', lockfileVersion: 3 }], limitations: [],
    },
  };
  const findings = [];
  assert.equal(reportedDependencyPackages(findings).length, 0);
  assert.equal(dependencyMapAvailable(run), true);
  assert.equal(dependencyMapAvailable(null), false);
});
