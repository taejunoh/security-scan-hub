import { lstat, opendir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

const manifests = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'Pipfile.lock', 'poetry.lock', 'uv.lock',
  'Cargo.lock', 'go.mod', 'composer.lock', 'Gemfile.lock', 'pom.xml',
  'gradle.lockfile', 'packages.lock.json', 'pubspec.lock',
]);
const ignored = new Set(['node_modules', 'vendor', 'build', 'dist', 'target', '__pycache__']);
const maxDepth = 3;
const maxDirectories = 32;
const maxEntries = 1024;
const maxExamples = 4;

/** Inspect directory entries only. The scanner determines actual coverage. */
export async function inspectProjectGuidance(root) {
  const queue = [{ path: root, depth: 0 }];
  const found = new Set();
  let limited = false;
  let entries = 0;
  const result = () => ({
    status: found.size ? 'recognized' : limited ? 'limited' : 'not-detected',
    examples: [...found].sort(),
  });

  for (const { path, depth } of queue) {
    try {
      // Refuse an aliased path if a queued directory became a link.
      if (!(await lstat(path)).isDirectory() || relative(path, await realpath(path)) !== '') {
        limited = true;
        continue;
      }
      const directory = await opendir(path, { bufferSize: 16 });
      for await (const entry of directory) {
        if (++entries > maxEntries) {
          limited = true;
          return result();
        }
        if (entry.isFile() && manifests.has(entry.name)) {
          found.add(entry.name);
          if (found.size === maxExamples) return result();
        }
        if (!entry.isDirectory() || entry.name.startsWith('.') || ignored.has(entry.name)) continue;
        if (depth === maxDepth || queue.length === maxDirectories) limited = true;
        else queue.push({ path: join(path, entry.name), depth: depth + 1 });
      }
    } catch {
      limited = true;
    }
  }
  return result();
}
