import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const logoNames = ['Square44x44Logo.png', 'StoreLogo.png', 'Square150x150Logo.png'];
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function validateIdentity({ name, publisher, publisherDisplayName, displayName }) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9.-]{3,50}$/.test(name) || name.startsWith('.') || name.endsWith('.') || name.includes('..')) {
    throw new Error('MSIX identity name must be 3–50 letters, numbers, periods, or hyphens, without empty dot segments');
  }
  if (typeof publisher !== 'string' || publisher.length > 8192 || !/^(CN|O|OU|L|S|C|E|STREET|SERIALNUMBER)=\S/.test(publisher)) {
    throw new Error('MSIX publisher must be the publisher distinguished name shown in Partner Center');
  }
  if (typeof publisherDisplayName !== 'string' || !publisherDisplayName.trim() || publisherDisplayName.length > 50) {
    throw new Error('MSIX publisher display name must contain 1–50 characters');
  }
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 50) {
    throw new Error('MSIX display name must contain 1–50 characters');
  }
  return { name, publisher, publisherDisplayName: publisherDisplayName.trim(), displayName: displayName.trim() };
}

export function validateVersion(version) {
  if (typeof version !== 'string' || !/^([1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.0$/.test(version)) {
    throw new Error('MSIX version must have four numeric parts, a nonzero first part, and a final revision of 0');
  }
  if (version.split('.').some(part => Number(part) > 65535)) throw new Error('MSIX version parts must not exceed 65535');
  return version;
}

export function appxManifest(identity, version) {
  const display = xml(identity.displayName);
  const publisherDisplayName = xml(identity.publisherDisplayName);
  const name = xml(identity.name);
  const publisher = xml(identity.publisher);
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap desktop rescap">
  <Identity Name="${name}" Publisher="${publisher}" Version="${version}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${display}</DisplayName>
    <PublisherDisplayName>${publisherDisplayName}</PublisherDisplayName>
    <Description>${display} desktop application</Description>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources><Resource Language="en-US" /></Resources>
  <Applications>
    <Application Id="App" Executable="Sec Hub.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="${display}" Description="${display} local security scanner" BackgroundColor="#233844" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" AppListEntry="default" />
    </Application>
  </Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
`;
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function sourceInventory(root, base = root) {
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`MSIX source contains a symbolic or unsupported path: ${root}`);
  const files = [];
  for (const entry of (await readdir(root)).sort()) {
    const filename = path.join(root, entry);
    const info = await lstat(filename);
    if (info.isSymbolicLink()) throw new Error(`MSIX source contains a symbolic path: ${filename}`);
    if (info.isDirectory()) files.push(...await sourceInventory(filename, base));
    else if (info.isFile()) files.push({ path: path.relative(base, filename).split(path.sep).join('/'), size: info.size, sha256: await hashFile(filename) });
    else throw new Error(`MSIX source contains an unsupported path: ${filename}`);
  }
  return files;
}

async function findMakeAppx() {
  const kits = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles;
  if (!kits) throw new Error('Windows SDK was not found. Install the Windows 10 SDK with MakeAppx.exe.');
  const root = path.join(kits, 'Windows Kits', '10', 'bin');
  let versions;
  try { versions = (await readdir(root)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); }
  catch { throw new Error('Windows SDK was not found. Install the Windows 10 SDK with MakeAppx.exe.'); }
  for (const version of versions) {
    const candidate = path.join(root, version, 'x64', 'MakeAppx.exe');
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  throw new Error('MakeAppx.exe was not found in the Windows SDK. Install the Windows 10 SDK.');
}

function runMakeAppx(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`MakeAppx failed with exit code ${code}`)));
  });
}

export async function buildMsix({ source, out, identityName, publisher, publisherDisplayName, version, displayName, makeAppx }) {
  const identity = validateIdentity({ name: identityName, publisher, publisherDisplayName, displayName });
  validateVersion(version);
  if (process.platform !== 'win32') throw new Error('MSIX packages must be assembled on native Windows with the Windows SDK');
  if (!path.isAbsolute(source) || !path.isAbsolute(out)) throw new Error('--source and --out must be absolute paths');
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isDirectory()) throw new Error('--source must be a regular extracted application directory');
  const actualSource = await realpath(source);
  if (path.basename(actualSource).toLowerCase() !== 'sec hub') throw new Error('--source must point to the extracted Sec Hub application directory');
  const executable = path.join(actualSource, 'Sec Hub.exe');
  try { if (!(await stat(executable)).isFile()) throw new Error(); }
  catch { throw new Error('MSIX source does not contain Sec Hub.exe'); }
  const appVersion = JSON.parse(await readFile(path.join(repository, 'desktop/app/package.json'), 'utf8')).version;
  const [appMajor, appMinor, appPatch] = appVersion.split('.');
  const expectedStoreVersion = `${Number(appMajor) + 1}.${appMinor}.${appPatch}.0`;
  if (version !== expectedStoreVersion) throw new Error(`MSIX version must map app version ${appVersion} to ${expectedStoreVersion}`);
  const inventory = await sourceInventory(actualSource);
  const payloadSha256 = createHash('sha256').update(`${JSON.stringify(inventory)}\n`).digest('hex');
  await mkdir(out, { recursive: true });
  const actualOut = await realpath(out);
  if (actualOut === actualSource || actualOut.startsWith(`${actualSource}${path.sep}`) || actualSource.startsWith(`${actualOut}${path.sep}`)) {
    throw new Error('--out must be separate from the source application directory');
  }
  const scratch = await mkdtemp(path.join(actualOut, '.msix-stage-'));
  const payload = path.join(scratch, 'payload');
  const assets = path.join(payload, 'Assets');
  const filename = `${identity.name}_${version}_x64.msix`;
  const destination = path.join(actualOut, filename);
  const metadataPath = path.join(actualOut, 'msix-identity.json');
  for (const existing of [destination, metadataPath]) {
    try { await lstat(existing); throw new Error(`MSIX output already exists: ${existing}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  try {
    await cp(actualSource, payload, { recursive: true, errorOnExist: true, force: false, dereference: false });
    await mkdir(assets);
    for (const name of logoNames) await copyFile(path.join(repository, 'desktop', 'branding', name), path.join(assets, name));
    await writeFile(path.join(payload, 'AppxManifest.xml'), appxManifest(identity, version), 'utf8');
    const stagedInventory = await sourceInventory(payload);
    const stagedSource = stagedInventory.filter(file => !file.path.startsWith('Assets/') && file.path !== 'AppxManifest.xml');
    const stagedHash = createHash('sha256').update(`${JSON.stringify(stagedSource)}\n`).digest('hex');
    if (stagedHash !== payloadSha256) throw new Error('MSIX staged payload differs from the verified application source');
    await runMakeAppx(makeAppx ?? await findMakeAppx(), ['pack', '/d', payload, '/p', destination]);
    const packageInfo = await stat(destination);
    const metadata = {
      schemaVersion: 1,
      identity: { ...identity, version },
      application: { version: appVersion, executable: 'Sec Hub.exe' },
      payloadSha256,
      package: { filename, sha256: await hashFile(destination), size: packageInfo.size },
      signing: { status: 'unsigned-store-submission' },
    };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
    return metadata;
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key?.startsWith('--') || options.has(key) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Usage: node desktop/msix/build.mjs --source <absolute directory> --out <absolute directory> --identity-name <reserved name> --publisher <publisher DN> --publisher-display-name <publisher name> --version <x.y.z.0> --display-name <display name>');
    }
    options.set(key, args[index + 1]);
  }
  const required = ['--source', '--out', '--identity-name', '--publisher', '--publisher-display-name', '--version', '--display-name'];
  if (options.size !== required.length || required.some(key => !options.has(key))) {
    throw new Error('Usage: node desktop/msix/build.mjs --source <absolute directory> --out <absolute directory> --identity-name <reserved name> --publisher <publisher DN> --publisher-display-name <publisher name> --version <x.y.z.0> --display-name <display name>');
  }
  return {
    source: options.get('--source'), out: options.get('--out'), identityName: options.get('--identity-name'),
    publisher: options.get('--publisher'), publisherDisplayName: options.get('--publisher-display-name'), version: options.get('--version'), displayName: options.get('--display-name'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildMsix(parseArgs(process.argv.slice(2)))
    .then(metadata => process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`))
    .catch(error => { process.stderr.write(`MSIX build failed: ${error.message}\n`); process.exitCode = 1; });
}
