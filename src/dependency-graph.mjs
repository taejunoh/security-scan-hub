import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';

export const DEPENDENCY_GRAPH_SCHEMA = 'sec-hub.dependency-graph/v1';
const DEFAULT_LIMITS = Object.freeze({ maxBytes: 10 * 1024 * 1024, maxPackages: 2_000, maxEdges: 5_000 });
const LOCKS = ['npm-shrinkwrap.json', 'package-lock.json'];
const KINDS = new Set(['dependency', 'devDependency', 'optionalDependency', 'peerDependency', 'workspaceLink', 'workspaceMember']);
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]{0,213}\/)?[a-z0-9][a-z0-9._~-]{0,213}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const FIXED_LIMITATIONS = Object.freeze({
  missing: 'No supported npm lockfile was found at the project root; dependency inventory is unavailable.',
  unsupported: 'Only root npm npm-shrinkwrap.json or package-lock.json versions 2 and 3 are supported; other package managers, workspace-local lockfiles, and npm lockfile v1 are outside this graph scope.',
  unsafe: 'The selected npm lockfile is not a safe regular file and was not read.',
  changed: 'The npm lockfile changed while it was being read; dependency inventory is incomplete.',
  tooLarge: 'The npm lockfile exceeds the configured byte limit; dependency inventory is incomplete.',
  invalid: 'The npm lockfile is invalid or does not contain a supported package map.',
  package: 'One or more npm package entries could not be represented safely; dependency inventory is incomplete.',
  edge: 'One or more declared dependency relationships could not be resolved to an installed package entry.',
  capped: 'The dependency graph reached a configured package or relationship limit; dependency inventory is incomplete.',
});

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function cleanPackagePath(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value === '.' || value.startsWith('/') || /^[a-z]:/i.test(value) || value.includes(':') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) return false;
  const parts = value.split('/');
  if (parts.length > 128 || !parts.every(part => part && part !== '.' && part !== '..' && part.length <= 255)) return false;
  for (let index = 0; index < parts.length; index++) if (parts[index] === 'node_modules') {
    const scoped = parts[index + 1]?.startsWith('@');
    const packageName = scoped ? `${parts[index + 1]}/${parts[index + 2] ?? ''}` : parts[index + 1];
    const next = index + (scoped ? 3 : 2);
    if (!PACKAGE_NAME.test(packageName ?? '') || parts[next] !== undefined && parts[next] !== 'node_modules') return false;
  }
  return true;
}
function packageFromKey(key) {
  const parts = key.split('/');
  const index = parts.lastIndexOf('node_modules');
  if (index >= 0) return parts[index + 1]?.startsWith('@') ? `${parts[index + 1]}/${parts[index + 2] ?? ''}` : parts[index + 1] ?? '';
  return null;
}
function safeNodeName(entry, key) {
  const name = typeof entry.name === 'string' && PACKAGE_NAME.test(entry.name) ? entry.name : packageFromKey(key);
  return typeof name === 'string' && PACKAGE_NAME.test(name) ? name : null;
}
function graph(status, lockfiles = [], limitations = []) {
  return { schema: DEPENDENCY_GRAPH_SCHEMA, status, ecosystem: 'npm', lockfiles, nodes: [], edges: [], limitations: [...new Set(limitations)] };
}
export function unavailableDependencyGraph() {
  return graph('unavailable', [], ['Graph collection could not safely complete; dependency inventory is unavailable.']);
}
function partial(target, reason, lockfiles = []) {
  if (target.status !== 'unavailable') target.status = 'partial';
  target.limitations = [...new Set([...target.limitations, reason])];
  target.lockfiles = lockfiles;
  return target;
}
function snapshot(stat) { return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`; }
function sameDirectory(a, b) { return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.isDirectory() && b.isDirectory() && !a.isSymbolicLink() && !b.isSymbolicLink(); }

async function boundedLockRead(file, maxBytes) {
  let handle;
  try {
    const before = await lstat(file, { bigint: true });
    if (before.isSymbolicLink() || !before.isFile()) return { error: 'unsafe' };
    const beforeSnapshot = snapshot(before);
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || snapshot(opened) !== beforeSnapshot) return { error: 'changed' };
    if (opened.size > BigInt(maxBytes)) return { error: 'tooLarge' };
    const buffer = Buffer.alloc(Number(opened.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const final = await lstat(file, { bigint: true });
    if (snapshot(after) !== beforeSnapshot || snapshot(final) !== beforeSnapshot || offset !== Number(opened.size)) return { error: 'changed' };
    if (offset > maxBytes) return { error: 'tooLarge' };
    return { bytes: buffer.subarray(0, offset) };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? 'missing' : error.code === 'ELOOP' ? 'unsafe' : 'changed' };
  } finally { await handle?.close().catch(() => {}); }
}

function directoryOf(key) { return key === '.' ? '' : key; }
function lookupInstalled(entries, from, dependency, peer = false) {
  let current = directoryOf(from);
  while (true) {
    if (path.posix.basename(current) !== 'node_modules') {
      const candidate = [current, 'node_modules', dependency].filter(Boolean).join('/');
      if (entries.has(candidate)) return candidate;
    }
    if (!current) return null;
    const parent = path.posix.dirname(current);
    current = parent === '.' ? '' : parent;
  }
}

function collectEdges(packages, nodes, limits) {
  const edges = [];
  const limitations = new Set();
  const entries = new Map(nodes.map(node => [node.id, packages[node.id === '.' ? '' : node.id]]));
  let declarations = 0;
  let capped = false;
  for (const node of nodes) {
    const entry = entries.get(node.id);
    const sections = [
      ['optionalDependencies', 'optionalDependency'],
      ['dependencies', 'dependency'],
      ['devDependencies', 'devDependency'],
      ['peerDependencies', 'peerDependency'],
    ];
    const selected = new Map();
    for (const [field, kind] of sections) {
      if (entry[field] === undefined) continue;
      if (!isObject(entry[field])) { limitations.add(FIXED_LIMITATIONS.edge); continue; }
      for (const dependency of Object.keys(entry[field])) if (!selected.has(dependency)) selected.set(dependency, kind);
    }
    for (const [dependency, kind] of selected) {
      if (++declarations > limits.maxEdges) { capped = true; break; }
      const field = ({ dependency: 'dependencies', devDependency: 'devDependencies', optionalDependency: 'optionalDependencies', peerDependency: 'peerDependencies' })[kind];
      const requested = entry[field]?.[dependency];
      if (!PACKAGE_NAME.test(dependency) || typeof requested !== 'string' || !requested || requested.length > 500) { limitations.add(FIXED_LIMITATIONS.edge); continue; }
      const target = lookupInstalled(entries, node.id, dependency, kind === 'peerDependency');
      if (!target || kind === 'peerDependency' && target.startsWith(`${node.id}/node_modules/`)) { limitations.add(FIXED_LIMITATIONS.edge); continue; }
      if (edges.length >= limits.maxEdges) { capped = true; break; }
      edges.push({ from: node.id, to: target, kind });
    }
    if (capped) break;
  }
  if (capped) limitations.add(FIXED_LIMITATIONS.capped);
  return { edges, limitations: [...limitations] };
}

/** Read a bounded root npm lockfile and construct an inventory plus resolved install relationships. */
export async function collectDependencyGraph(target, overrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits)) if (!(key in DEFAULT_LIMITS) || !Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) throw new TypeError(`Invalid dependency graph limit: ${key}`);
  const root = path.resolve(target);
  let rootStat;
  try { rootStat = await lstat(root, { bigint: true }); } catch { return partial(graph('unavailable'), FIXED_LIMITATIONS.unsafe); }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return partial(graph('unavailable'), FIXED_LIMITATIONS.unsafe);
  let lockName, lockStat;
  for (const name of LOCKS) {
    try { lockStat = await lstat(path.join(root, name)); lockName = name; break; }
    catch (error) { if (error.code !== 'ENOENT') return partial(graph('unavailable'), FIXED_LIMITATIONS.unsafe); }
  }
  if (!lockName) {
    const found = [];
    for (const name of ['pnpm-lock.yaml', 'yarn.lock']) try { await lstat(path.join(root, name)); found.push(name); } catch (error) { if (error.code !== 'ENOENT') found.push(name); }
    const limitation = found.length ? `Detected ${found.join(' and ')}, but ${FIXED_LIMITATIONS.unsupported}` : FIXED_LIMITATIONS.missing;
    return found.length ? partial(graph('partial'), limitation) : partial(graph('unavailable'), limitation);
  }
  const lockPath = path.join(root, lockName);
  if (lockStat.isSymbolicLink() || !lockStat.isFile()) return partial(graph('unavailable'), FIXED_LIMITATIONS.unsafe, [{ path: lockName, lockfileVersion: null }]);
  const read = await boundedLockRead(lockPath, limits.maxBytes);
  if (read.error) {
    const reason = read.error === 'missing' ? FIXED_LIMITATIONS.changed : FIXED_LIMITATIONS[read.error] ?? FIXED_LIMITATIONS.changed;
    return partial(graph(read.error === 'unsafe' ? 'unavailable' : 'partial'), reason, [{ path: lockName, lockfileVersion: null }]);
  }
  const finalRoot = await lstat(root, { bigint: true }).catch(() => null);
  if (!finalRoot || !sameDirectory(rootStat, finalRoot)) return partial(graph('partial'), FIXED_LIMITATIONS.changed, [{ path: lockName, lockfileVersion: null }]);
  let lock;
  try { lock = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes)); } catch { return partial(graph('partial'), FIXED_LIMITATIONS.invalid, [{ path: lockName, lockfileVersion: null }]); }
  const version = lock?.lockfileVersion;
  const lockfiles = [{ path: lockName, lockfileVersion: Number.isSafeInteger(version) ? version : null }];
  if (!isObject(lock) || ![2, 3].includes(version) || !isObject(lock.packages) || !isObject(lock.packages[''])) {
    const detail = Number.isSafeInteger(version) ? ` Found npm lockfile version ${version}.` : '';
    return partial(graph('partial', lockfiles), `${FIXED_LIMITATIONS.unsupported}${detail}`, lockfiles);
  }

  const result = graph('complete', lockfiles);
  const rootVersion = lock.packages[''].version;
  const nodes = [{ id: '.', path: '.', name: safeNodeName(lock.packages[''], '' ) ?? 'project', kind: 'project', ...(typeof rootVersion === 'string' && SAFE_VERSION.test(rootVersion) ? { version: rootVersion } : {}) }];
  let capped = false;
  let packageCount = 0;
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '') continue;
    if (++packageCount > limits.maxPackages) { capped = true; break; }
    if (!cleanPackagePath(key) || !isObject(entry)) { result.limitations.push(FIXED_LIMITATIONS.package); continue; }
    const name = safeNodeName(entry, key);
    if (!name) { result.limitations.push(FIXED_LIMITATIONS.package); continue; }
    if (entry.version !== undefined && (typeof entry.version !== 'string' || !SAFE_VERSION.test(entry.version))) result.limitations.push(FIXED_LIMITATIONS.package);
    nodes.push({ id: key, path: key, name, kind: entry.link === true ? 'workspace-link' : key.includes('/node_modules/') || key.startsWith('node_modules/') ? 'package' : 'workspace', ...(typeof entry.version === 'string' && SAFE_VERSION.test(entry.version) ? { version: entry.version } : {}) });
  }
  if (capped) result.limitations.push(FIXED_LIMITATIONS.capped);
  const validIds = new Set(nodes.map(node => node.id));
  for (const node of nodes) if (node.kind === 'workspace-link') {
    const link = lock.packages[node.id];
    const resolved = link.resolved;
    if (typeof resolved !== 'string' || !cleanPackagePath(resolved) || !validIds.has(resolved)) result.limitations.push(FIXED_LIMITATIONS.package);
    else {
      const destination = nodes.find(item => item.id === resolved);
      if (destination && destination.kind === 'workspace') {
        node.name = destination.name;
        node.version = destination.version;
        if (result.edges.length >= limits.maxEdges) result.limitations.push(FIXED_LIMITATIONS.capped);
        else result.edges.push({ from: node.id, to: destination.id, kind: 'workspaceLink' });
      } else result.limitations.push(FIXED_LIMITATIONS.package);
    }
  }
  for (const node of nodes) if (node.kind === 'workspace') {
    if (result.edges.length >= limits.maxEdges) { result.limitations.push(FIXED_LIMITATIONS.capped); break; }
    result.edges.push({ from: '.', to: node.id, kind: 'workspaceMember' });
  }
  const resolvedEdges = collectEdges(lock.packages, nodes, { ...limits, maxEdges: limits.maxEdges - result.edges.length });
  if (result.limitations.length) { /* keep collecting safely; status is finalized below */ }
  result.nodes = nodes;
  result.edges.push(...resolvedEdges.edges.filter(edge => validIds.has(edge.from) && validIds.has(edge.to)));
  for (const limitation of resolvedEdges.limitations) if (!result.limitations.includes(limitation)) result.limitations.push(limitation);
  result.limitations = [...new Set(result.limitations)];
  if (result.limitations.length) result.status = 'partial';
  return result;
}

/** Strictly validate saved graphs before exposing them from the dashboard. */
export function validateDependencyGraph(value) {
  if (!isObject(value) || Object.keys(value).some(key => !['schema', 'status', 'ecosystem', 'lockfiles', 'nodes', 'edges', 'limitations'].includes(key)) || value.schema !== DEPENDENCY_GRAPH_SCHEMA || !['complete', 'partial', 'unavailable'].includes(value.status) || value.ecosystem !== 'npm' || !Array.isArray(value.lockfiles) || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || !Array.isArray(value.limitations) || value.limitations.length > 20 || value.limitations.some(item => typeof item !== 'string' || item.length > 500)) return false;
  if (value.nodes.length > DEFAULT_LIMITS.maxPackages + 1 || value.edges.length > DEFAULT_LIMITS.maxEdges || value.lockfiles.length > 1) return false;
  if (value.lockfiles.some(item => !isObject(item) || Object.keys(item).some(key => !['path', 'lockfileVersion'].includes(key)) || !LOCKS.includes(item.path) || item.lockfileVersion !== null && !Number.isSafeInteger(item.lockfileVersion))) return false;
  const ids = new Set();
  for (const node of value.nodes) {
    if (!isObject(node) || Object.keys(node).some(key => !['id', 'path', 'name', 'kind', 'version'].includes(key)) || !cleanPackagePath(node.id === '.' ? 'project' : node.id) || node.path !== node.id || typeof node.name !== 'string' || !PACKAGE_NAME.test(node.name) && node.name !== 'project' || !['project', 'package', 'workspace', 'workspace-link'].includes(node.kind) || (node.id === '.') !== (node.kind === 'project') || node.version !== undefined && (typeof node.version !== 'string' || !SAFE_VERSION.test(node.version)) || ids.has(node.id)) return false;
    ids.add(node.id);
  }
  if (value.status === 'complete' && (value.lockfiles.length !== 1 || ![2, 3].includes(value.lockfiles[0].lockfileVersion) || value.limitations.length || !ids.has('.'))) return false;
  if (value.status === 'unavailable' && value.nodes.length) return false;
  return value.edges.every(edge => isObject(edge) && Object.keys(edge).every(key => ['from', 'to', 'kind'].includes(key)) && ids.has(edge.from) && ids.has(edge.to) && KINDS.has(edge.kind) && (edge.kind !== 'workspaceLink' || value.nodes.some(node => node.id === edge.from && node.kind === 'workspace-link') && value.nodes.some(node => node.id === edge.to && node.kind === 'workspace')) && (edge.kind !== 'workspaceMember' || edge.from === '.' && value.nodes.some(node => node.id === edge.to && node.kind === 'workspace')));
}
