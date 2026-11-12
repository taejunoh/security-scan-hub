import { translate } from './i18n.mjs';

const text = (value) => String(value ?? '').toLocaleLowerCase();
const nonempty = (value) => typeof value === 'string' && value.trim() ? value : undefined;
const asArray = (value) => Array.isArray(value) ? value : [];
const severityOrder = ['unknown', 'info', 'low', 'medium', 'high', 'critical'];

export function findingSeverity(finding) {
  return severityOrder.includes(finding?.severity) ? finding.severity : 'unknown';
}
const severityRank = (finding) => Math.max(0, severityOrder.indexOf(finding?.severity));
const osvAdvisoryPrefix = 'https://osv.dev/vulnerability/';
const osvId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
const legacyOsvId = /^(?:GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|(?:CVE|GO|PYSEC|RUSTSEC|OSV)-[0-9]{4}-[0-9]+)$/;

export function sortFindingsBySeverity(findings) {
  return [...asArray(findings)].sort((a, b) => severityRank(b) - severityRank(a));
}

function fixedPackageVersion(affected, name, ecosystem) {
  if (!name || !ecosystem) return undefined;
  const matching = asArray(affected).filter((entry) => entry?.package?.name === name && entry.package.ecosystem === ecosystem);
  if (matching.length !== 1) return undefined;
  // A single bounded version range gives an unambiguous fix boundary.
  const ranges = asArray(matching[0].ranges);
  if (ranges.length !== 1 || !['SEMVER', 'ECOSYSTEM'].includes(ranges[0]?.type)) return undefined;
  const events = asArray(ranges[0].events);
  if (events.length !== 2 || !nonempty(events[0]?.introduced)) return undefined;
  return nonempty(events[1]?.fixed);
}

function osvAdvisoryUrl(finding) {
  const id = finding.vulnerabilityId;
  if (osvId(id)) return osvAdvisoryPrefix + id;
  const ruleId = finding.ruleId;
  if (typeof ruleId === 'string' && legacyOsvId.test(ruleId)) return osvAdvisoryPrefix + ruleId;
  return asArray(finding.references).find((reference) =>
    typeof reference === 'string' && reference.startsWith(osvAdvisoryPrefix)
      && osvId(reference.slice(osvAdvisoryPrefix.length)));
}

function findingPackageIdentity(finding) {
  if (finding?.toolId !== 'osv') return {};
  const packageRecord = finding.evidence?.package;
  const locationPackage = nonempty(finding.location?.package) ?? '';
  const separator = locationPackage.indexOf(':');
  const name = nonempty(packageRecord?.name) ?? nonempty(locationPackage.slice(separator + 1));
  const version = nonempty(packageRecord?.version) ?? nonempty(finding.location?.version);
  const ecosystem = nonempty(packageRecord?.ecosystem) ?? (separator > 0 ? locationPackage.slice(0, separator) : undefined);
  return { name, version, ecosystem };
}

export function findingPackage(finding) {
  if (finding?.toolId !== 'osv') return {};
  const { name, version, ecosystem } = findingPackageIdentity(finding);
  const fixedVersion = fixedPackageVersion(finding.evidence?.affected, name, ecosystem);
  const advisoryUrl = osvAdvisoryUrl(finding);
  return {
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
    ...(fixedVersion ? { fixedVersion } : {}),
    ...(advisoryUrl ? { advisoryUrl } : {}),
  };
}

export function reportedDependencyPackages(findings) {
  const packages = new Map();
  for (const [index, finding] of asArray(findings).entries()) {
    const { name, version, ecosystem } = findingPackageIdentity(finding);
    if (!name) continue;
    const key = JSON.stringify([ecosystem, name, version]);
    if (!packages.has(key)) packages.set(key, { ecosystem, name, version, sources: new Set(), findingIndices: [] });
    const entry = packages.get(key);
    const source = nonempty(finding.evidence?.source?.path) ?? nonempty(finding.location?.path);
    if (source) entry.sources.add(source);
    entry.findingIndices.push(index);
  }
  return [...packages.values()].map((entry) => ({ ...entry, sources: [...entry.sources] }));
}

export function dependencyMapAvailable(run) {
  // Active runs can show the graph, a saved-data notice, and/or the reported packages section.
  return Boolean(run && typeof run === 'object');
}

export function dependencyGraphView(graph, { query = '', scope = 'all', graphLimit = 32 } = {}) {
  if (!graph) return { status: 'unavailable', nodes: [], edges: [], allNodes: [], allEdges: [], limitations: [] };
  if (graph.schema !== 'sec-hub.dependency-graph/v1' || graph.ecosystem !== 'npm'
    || !['complete', 'partial', 'unavailable'].includes(graph.status)) {
    return { status: 'unavailable', nodes: [], edges: [], allNodes: [], allEdges: [], limitations: [] };
  }
  const validNodes = [];
  const ids = new Set();
  for (const node of asArray(graph.nodes)) {
    if (typeof node?.id !== 'string' || !node.id || ids.has(node.id) || typeof node.name !== 'string' || !node.name) continue;
    ids.add(node.id);
    validNodes.push({ id: node.id, name: node.name, version: nonempty(node.version), path: nonempty(node.path), kind: nonempty(node.kind) });
  }
  const edges = asArray(graph.edges).filter((edge) => ids.has(edge?.from) && ids.has(edge?.to)
    && ['dependency', 'devDependency', 'optionalDependency', 'peerDependency', 'workspaceLink', 'workspaceMember'].includes(edge?.kind))
    .map((edge) => ({ from: edge.from, to: edge.to, kind: edge.from === '.' ? 'direct' : 'transitive', relationship: edge.kind }));
  const directTargets = new Set(edges.filter((edge) => edge.kind === 'direct').map((edge) => edge.to));
  const transitiveTargets = new Set(edges.filter((edge) => edge.kind === 'transitive').map((edge) => edge.to));
  const q = text(query).trim();
  const allowed = (node) => node.id !== '.' && (scope === 'all' || (scope === 'direct' ? directTargets : transitiveTargets).has(node.id))
    && (!q || [node.name, node.version, node.path].map(text).join(' ').includes(q));
  const allNodes = validNodes.filter((node) => node.id !== '.');
  const nodes = allNodes.filter(allowed);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.to) && (visibleIds.has(edge.from) || edge.from === '.'));
  return {
    status: graph.status,
    nodes,
    edges: visibleEdges,
    allNodes,
    allEdges: edges,
    limitations: asArray(graph.limitations).filter((item) => typeof item === 'string').slice(0, 20),
    lockfiles: asArray(graph.lockfiles).filter((item) => typeof item?.path === 'string').map(({ path, lockfileVersion }) => ({ path, lockfileVersion })),
    root: validNodes.find((node) => node.id === '.'),
    tooLarge: nodes.length > Math.max(1, graphLimit),
    totalNodes: validNodes.filter((node) => node.id !== '.').length,
    totalEdges: edges.length,
  };
}

export function layoutDependencyGraph(graph, { nodeWidth = 190, nodeHeight = 48, columnGap = 82, rowGap = 28, margin = 28 } = {}) {
  const nodes = asArray(graph?.nodes).filter((node) => typeof node?.id === 'string' && node.id !== '.');
  const edges = asArray(graph?.edges).filter((edge) => typeof edge?.from === 'string' && typeof edge?.to === 'string');
  const nodeIds = new Set(nodes.map((node) => node.id));
  const bySource = new Map();
  for (const edge of edges) {
    if (edge.from !== '.' && !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    if (!bySource.has(edge.from)) bySource.set(edge.from, []);
    bySource.get(edge.from).push(edge.to);
  }
  const depths = new Map([['.', 0]]);
  const queue = ['.'];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const source = queue[cursor];
    for (const target of bySource.get(source) ?? []) {
      if (depths.has(target)) continue;
      depths.set(target, (depths.get(source) ?? 0) + 1);
      queue.push(target);
    }
  }
  for (const node of nodes) if (!depths.has(node.id)) depths.set(node.id, 1);
  const levels = new Map();
  for (const node of nodes) {
    const level = depths.get(node.id);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  }
  const maxLevel = Math.max(0, ...levels.keys());
  const rowStep = nodeHeight + rowGap;
  const maxRows = Math.max(1, ...[...levels.values()].map((items) => items.length));
  const height = margin * 2 + maxRows * rowStep - rowGap;
  const positions = new Map();
  const stepX = nodeWidth + columnGap;
  for (const [level, items] of levels) {
    items.forEach((node, index) => positions.set(node.id, { x: margin + level * stepX, y: margin + index * rowStep, width: nodeWidth, height: nodeHeight, level }));
  }
  const directCount = (levels.get(1) ?? []).length;
  positions.set('.', { x: margin, y: margin + Math.max(0, (directCount - 1) * rowStep / 2), width: nodeWidth, height: nodeHeight, level: 0 });

  const includedEdges = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to));
  const outgoing = new Map(); const incoming = new Map();
  includedEdges.forEach((edge, index) => {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(index);
    incoming.get(edge.to).push(index);
  });
  const edgeOffsets = (indices, endpoint) => {
    indices.sort((a, b) => positions.get(endpoint(includedEdges[a])).y - positions.get(endpoint(includedEdges[b])).y || a - b);
    return new Map(indices.map((index, order) => [index, indices.length < 2 ? 0 : (order / (indices.length - 1) - .5) * Math.min(24, nodeHeight - 8)]));
  };
  const outgoingOffsets = new Map(); const incomingOffsets = new Map();
  for (const [id, indices] of outgoing) outgoingOffsets.set(id, edgeOffsets(indices, (edge) => edge.to));
  for (const [id, indices] of incoming) incomingOffsets.set(id, edgeOffsets(indices, (edge) => edge.from));
  const allNodeRects = [...positions.values()];
  const rightmost = Math.max(...allNodeRects.map((rect) => rect.x + rect.width));
  const selfEdgeCounts = new Map();
  for (const edge of includedEdges) if (edge.from === edge.to) selfEdgeCounts.set(edge.from, (selfEdgeCounts.get(edge.from) ?? 0) + 1);
  const selfEdgeOffsets = new Map();
  let routeLaneIndex = 0;
  const laidOutEdges = includedEdges.map((edge, index) => {
    const from = positions.get(edge.from); const to = positions.get(edge.to);
    const sourceY = from.y + nodeHeight / 2 + (outgoingOffsets.get(edge.from)?.get(index) ?? 0);
    const targetY = to.y + nodeHeight / 2 + (incomingOffsets.get(edge.to)?.get(index) ?? 0);
    let start; let end; let controls; let path;
    if (edge.from === edge.to) {
      const edgeOrdinal = selfEdgeOffsets.get(edge.from) ?? 0;
      selfEdgeOffsets.set(edge.from, edgeOrdinal + 1);
      const lane = from.x + nodeWidth + 16 + edgeOrdinal * 8;
      start = { x: from.x + nodeWidth, y: from.y + nodeHeight / 2 };
      end = { x: from.x + nodeWidth, y: from.y + nodeHeight };
      controls = [{ x: lane, y: start.y }, { x: lane, y: end.y + 16 }];
      path = `M ${start.x} ${start.y} H ${lane} V ${end.y + 16} H ${end.x} V ${end.y}`;
    } else if (to.level === from.level + 1) {
      start = { x: from.x + nodeWidth, y: sourceY };
      end = { x: to.x, y: targetY };
      const middle = (start.x + end.x) / 2;
      controls = [{ x: middle, y: start.y }, { x: middle, y: end.y }];
      path = `M ${start.x} ${start.y} C ${controls[0].x} ${controls[0].y}, ${controls[1].x} ${controls[1].y}, ${end.x} ${end.y}`;
    } else if (to.level > from.level) {
      const lane = height + 24 + routeLaneIndex++ * 18;
      start = { x: from.x + nodeWidth, y: sourceY };
      end = { x: to.x, y: targetY };
      controls = [{ x: start.x + 16, y: start.y }, { x: start.x + 16, y: lane }, { x: end.x - 16, y: lane }, { x: end.x - 16, y: end.y }];
      path = `M ${start.x} ${start.y} H ${controls[0].x} V ${lane} H ${controls[2].x} V ${end.y} H ${end.x}`;
    } else {
      const lane = height + 24 + routeLaneIndex++ * 18;
      start = { x: from.x + nodeWidth, y: sourceY };
      end = { x: to.x + nodeWidth, y: targetY };
      controls = [{ x: start.x + 16, y: start.y }, { x: start.x + 16, y: lane }, { x: end.x + 16, y: lane }, { x: end.x + 16, y: end.y }];
      path = `M ${start.x} ${start.y} H ${controls[0].x} V ${lane} H ${controls[2].x} V ${end.y} H ${end.x}`;
    }
    const route = edge.from === edge.to ? 'self' : to.level === from.level + 1 ? 'forward' : to.level > from.level ? 'skip' : 'back';
    return { ...edge, start, end, controls, path, route };
  });
  const selfRects = [...selfEdgeCounts].map(([id, count]) => positions.get(id) && positions.get(id).x + nodeWidth + 16 + (count - 1) * 8);
  const selfBottom = selfEdgeCounts.size ? Math.max(...[...positions.values()].map((rect) => rect.y + rect.height)) + 16 + margin : 0;
  const routedHeight = Math.max(height + (routeLaneIndex ? 24 + (routeLaneIndex - 1) * 18 + margin : 0), selfBottom);
  const maxSelfLane = Math.max(0, ...selfRects.filter(Number.isFinite));
  const width = Math.max(margin * 2 + nodeWidth + maxLevel * stepX, rightmost + margin, maxSelfLane ? maxSelfLane + margin : 0, rightmost + (routeLaneIndex ? 16 + margin : 0));
  return { positions, edges: laidOutEdges, width, height: routedHeight, nodeWidth, nodeHeight };
}

function actionText(value, limit = 4000) {
  if (!nonempty(value)) return undefined;
  return value.length <= limit ? value : value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/u, '') + '…';
}

export function findingAction(finding, dependency = findingPackage(finding)) {
  const { toolId, evidence, remediation } = finding ?? {};
  if (toolId === 'osv') {
    const fixedVersion = nonempty(dependency?.fixedVersion);
    return { kind: 'dependency', ...(fixedVersion ? { fixedVersion } : {}) };
  }
  if (toolId === 'php2shell') return { kind: 'php' };

  let savedGuidance;
  let suggestion;
  const changes = [];
  switch (toolId) {
    case 'codex-security':
    case 'skillspector':
      savedGuidance = evidence?.remediation;
      break;
    case 'open-code-review':
      suggestion = actionText(evidence?.suggestionCode);
      break;
    case 'anthropic':
      savedGuidance = evidence?.native?.recommendation;
      break;
    case 'cloudflare': {
      const nativeRemediation = evidence?.native?.remediation;
      savedGuidance = nativeRemediation?.strategy;
      for (const change of asArray(nativeRemediation?.code_changes)) {
        const path = actionText(change?.file_name, 512);
        const code = actionText(change?.fixed_code);
        if (path && code) changes.push({ path, code });
        if (changes.length === 3) break;
      }
      break;
    }
  }
  const guidance = actionText(savedGuidance) ?? actionText(remediation);
  if (!guidance && !suggestion && changes.length === 0) return { kind: 'review' };
  return {
    kind: 'code',
    ...(guidance ? { guidance } : {}),
    ...(suggestion ? { suggestion } : {}),
    ...(changes.length ? { changes } : {}),
  };
}

export function compactPath(value) {
  const full = String(value ?? '');
  const characters = Array.from(full);
  if (characters.length <= 48) return { summary: full, full };
  let end = full.length;
  while (end > 0 && (full[end - 1] === '/' || full[end - 1] === '\\')) end -= 1;
  const lastSeparator = Math.max(full.lastIndexOf('/', end - 1), full.lastIndexOf('\\', end - 1));
  const previousSeparator = lastSeparator > 0
    ? Math.max(full.lastIndexOf('/', lastSeparator - 1), full.lastIndexOf('\\', lastSeparator - 1)) : -1;
  const context = full.slice(previousSeparator + 1);
  const tail = Array.from(context).slice(-44).join('');
  const separator = full.includes('\\') && !full.includes('/') ? '\\' : '/';
  return { summary: `…${separator}${tail}`, full };
}

export function filterArtifacts(artifacts, { query = '', kind = 'all', status = 'all', tool = 'all' } = {}) {
  const q = text(query).trim();
  return (Array.isArray(artifacts) ? artifacts : []).filter((artifact) => {
    const summary = artifact?.summary ?? {};
    const runStatus = summary.status ?? 'error';
    const haystack = [artifact?.label, summary.runId, summary.baselineId, summary.currentId, summary.target?.path]
      .map(text).join(' ');
    const tools = Array.isArray(summary.tools) ? summary.tools : [];
    return (kind === 'all' || artifact?.kind === kind)
      && (status === 'all' || runStatus === status || (status === 'error' && artifact?.state === 'error'))
      && (tool === 'all' || tools.some((item) => item?.id === tool))
      && (!q || haystack.includes(q));
  });
}

export function filterFindings(findings, { query = '', severity = 'all', tool = 'all' } = {}) {
  const q = text(query).trim();
  return asArray(findings).filter((finding) => {
    if ((severity !== 'all' && findingSeverity(finding) !== severity) || (tool !== 'all' && finding?.toolId !== tool)) return false;
    if (!q) return true;
    const location = finding?.location;
    const locationText = typeof location === 'string' ? location : JSON.stringify(location ?? {});
    const { name, version, fixedVersion } = findingPackage(finding);
    const haystack = [finding?.severity, finding?.ruleId, finding?.toolId, finding?.title,
      finding?.description, location?.path, locationText, name, version, fixedVersion].map(text).join(' ');
    return haystack.includes(q);
  });
}

export function pageItems(items, page = 1, pageSize = 100) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Math.min(100, Number.isInteger(pageSize) ? pageSize : 100));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.max(1, Math.min(pages, Number.isInteger(page) ? page : 1));
  return { items: list.slice((current - 1) * size, current * size), page: current, pages, total: list.length };
}

export function gateLabel(exitCode) {
  if (exitCode === 0) return '비교 완료 · 기준 통과';
  if (exitCode === 1) return '비교 완료 · 기준 위반';
  return '범위 불충분 · 판단 불가';
}

const CATEGORY_LABELS = Object.freeze({
  new: '새로 관측',
  regressed: '심각도 변화 · 검토 필요',
  existing: '기존',
  resolved: '완료 검사에서 더 이상 보고되지 않음',
  unobserved: '범위 부족 · 미관측',
});

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? '알 수 없는 범주';
}

export function runStatusLabel(status) {
  return ({ completed: '실행 완료', partial: '부분 완료', failed: '실패' })[status] ?? '상태 미기록';
}

export function toolStatusLabel(status, locale = 'ko') {
  const label = ({ completed: '완료', failed: '실패', timed_out: '시간 초과', cancelled: '취소', skipped: '건너뜀', imported: '가져온 결과 · 로컬 실행 아님' })[status];
  return label ? translate(locale, label) : status == null ? translate(locale, '상태 미기록') : String(status);
}

export function verificationLabel(value, locale = 'ko') {
  if (value === 'candidate') return translate(locale, '후보');
  if (value === 'confirmed') return translate(locale, '저장된 주장 · 확인됨');
  if (value == null || value === '') return translate(locale, '보고됨 · 검증 수준 미기록');
  return String(value);
}

export function comparisonControlState(pending, hasInputs) {
  return { inputsDisabled: Boolean(pending), compareDisabled: Boolean(pending || !hasInputs) };
}

export function transitionFindingView(findings, state, patch) {
  const next = { ...state, ...patch };
  const changedFilter = ['query', 'severity', 'tool'].some((key) => key in patch && patch[key] !== state[key]);
  const matches = filterFindings(findings, next);
  next.page = pageItems(matches, changedFilter ? 1 : next.page).page;
  if (!matches.includes(findings[next.selectedIndex])) next.selectedIndex = null;
  return next;
}
