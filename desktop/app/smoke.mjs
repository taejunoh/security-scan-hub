import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

function bounded(promise, ms, code) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(code)), ms); })]).finally(() => clearTimeout(timer));
}
export async function stopSecondary(child, exited) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  try { await bounded(exited, 1000, 'secondary_cleanup_timeout'); }
  catch {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await bounded(exited, 3000, 'secondary_cleanup_failed');
  }
}
export function portClosed(url) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(new URL(url).port) });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', (error) => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

// Called only after main validates the explicit flag AND private harness directory.
export async function runPackagedSmoke({ directory, window, controller, actions, selectFolder, domLoaded, secondInstance, closeWindow, urls }) {
  const captureStoreListingScreenshot = process.platform === 'win32'
    && process.windowsStore === true
    && process.env.SEC_HUB_MSIX_STORE_SCREENSHOT === '1';
  const summary = {
    status: 'failed',
    runtime: { electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch, windowsStore: process.windowsStore === true },
    checks: { rendererLoad: false, catalog: false, securityPreferences: false, folderSwitch: false, singleInstance: false, closedPort: false, executionUnavailable: false, nativeScan: false, firstUse: false, demoScan: false },
    urls,
  };
  let secondary;
  let secondaryExit;
  try {
    const preferences = window.webContents.getLastWebPreferences();
    summary.webPreferences = { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration, webSecurity: preferences.webSecurity };
    const invoke = (source, gesture = false) => window.webContents.executeJavaScript(source, gesture);
    const waitFor = async (read, ms, code) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const value = await read();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw Error(code);
    };
    const click = (id) => invoke(`document.getElementById(${JSON.stringify(id)}).click()`, true);
    const inspectRenderer = () => invoke(`(async () => ({ readyState: document.readyState, rows: document.querySelector('#artifact-list')?.children.length ?? 0, catalog: await (await fetch('/api/catalog')).json(), executionStatus: (await fetch('/api/execution')).status }))()`);
    const inspectNativeTitle = async (expected) => {
      const changeTitle = async (script) => {
        const changed = new Promise((resolve) => window.once('page-title-updated', () => setImmediate(resolve)));
        const document = await window.webContents.executeJavaScript(script);
        await bounded(changed, 3000, 'renderer_title_event_missing');
        return { document, native: window.getTitle() };
      };
      const english = await changeTitle(`(() => {
        const select = document.querySelector('#language-select');
        select.value = 'en';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          language: document.documentElement.lang,
          selection: select.value,
          title: document.title,
          heading: document.querySelector('.brand h1')?.textContent,
          welcomeHeading: document.getElementById('desktop-scan-title').textContent,
        };
      })()`);
      const changed = await changeTitle(`document.title = 'Untrusted renderer title'`);
      const { language, selection, title, heading, welcomeHeading } = english.document;
      const preserved = english.native === expected && changed.native === expected && language === 'en' && selection === 'en'
        && title === 'Security Scan Hub / Developer Workbench' && heading === 'Security Scan Hub'
        && welcomeHeading === 'Check your app';
      return { expected, afterLanguage: english.native, afterDocumentTitle: changed.native, englishDocument: english.document, preserved };
    };
    await waitFor(() => invoke(`document.body.dataset.desktopView === 'scan'
      && !document.getElementById('desktop-welcome').hidden
      && !document.getElementById('desktop-example-route').disabled`), 15_000, 'renderer_not_ready');
    const renderer = await inspectRenderer();
    const rendererPrivileges = await window.webContents.executeJavaScript(`({
      nodeExposed: typeof require !== 'undefined' || typeof process !== 'undefined',
      ipcExposed: typeof ipcRenderer !== 'undefined',
      bridge: Object.keys(window.secHubDesktop ?? {}).sort(),
    })`);
    summary.rendererPrivileges = rendererPrivileges;
    summary.checks.securityPreferences = preferences.sandbox === true && preferences.contextIsolation === true
      && preferences.nodeIntegration === false && preferences.webSecurity === true
      && !rendererPrivileges.nodeExposed && !rendererPrivileges.ipcExposed
      && rendererPrivileges.bridge.join(',') === 'cancelScan,chooseConfig,chooseDemo,chooseFolder,chooseNode,getJob,getState,openSetup,refreshResults,startScan';
    const count = renderer.catalog.artifacts.filter((item) => item.state === 'ready').length;
    summary.renderer = { domContentLoaded: domLoaded(), catalogCount: count };
    summary.checks.rendererLoad = domLoaded() && ['interactive', 'complete'].includes(renderer.readyState);
    summary.checks.catalog = count > 0 && renderer.executionStatus === 404;
    summary.checks.executionUnavailable = renderer.executionStatus === 404;
    summary.nativeTitles = { welcome: await inspectNativeTitle('Security Scan Hub') };
    summary.checks.rendererLoad &&= summary.nativeTitles.welcome.preserved;
    window.focus();
    const initialProject = await invoke('window.secHubDesktop.getState()');
    const demoWithoutGesture = await invoke('window.secHubDesktop.chooseDemo()');
    const welcome = await invoke(`({
      own: document.getElementById('desktop-own-route').textContent.trim(),
      example: document.getElementById('desktop-example-route').textContent.trim(),
      results: document.getElementById('desktop-nav-results').textContent.trim(),
      homeActive: document.getElementById('desktop-nav-home').getAttribute('aria-current') === 'page',
      resultsNavVisible: document.getElementById('desktop-nav-results').getClientRects().length > 0,
      dependenciesHidden: document.getElementById('desktop-nav-dependencies').getClientRects().length === 0,
      resultsVisible: document.querySelector('.desk').getClientRects().length > 0,
    })`);
    summary.firstUse = {
      ...welcome, renderedCatalogRows: renderer.rows, projectKind: initialProject.projectKind,
      initialJob: initialProject.job, demoWithoutGesture: demoWithoutGesture.error?.code,
    };
    summary.checks.firstUse = welcome.own === 'Scan my app' && welcome.example === 'Try an example'
      && welcome.results === 'Scan results' && welcome.homeActive && welcome.resultsNavVisible
      && welcome.dependenciesHidden && !welcome.resultsVisible && renderer.rows === 0
      && initialProject.projectKind === null && initialProject.job === null && demoWithoutGesture.error?.code === 'forbidden';
    if (!summary.checks.firstUse) throw Error('first_use_welcome_mismatch');

    await click('desktop-example-route');
    await waitFor(() => invoke(`!document.getElementById('desktop-review').hidden
      && !document.getElementById('desktop-demo-note').hidden
      && !document.getElementById('execution-start').disabled`), 5000, 'demo_review_unavailable');
    const preparedDemo = await invoke('window.secHubDesktop.getState()');
    const demoStart = await invoke("document.getElementById('execution-start').textContent");
    const demoPrepared = preparedDemo.projectKind === 'demo' && preparedDemo.job === null
      && preparedDemo.projectGuidance?.status === 'recognized'
      && preparedDemo.projectGuidance.examples.includes('package-lock.json')
      && preparedDemo.tools.length === 1 && preparedDemo.tools[0].id === 'osv' && preparedDemo.tools[0].selectable
      && demoStart === 'Start example scan';
    summary.demoScan = { projectKind: preparedDemo.projectKind, demoPrepared };
    if (!demoPrepared) throw Error('demo_started_before_confirmation');
    await click('execution-start');
    const demoJob = await waitFor(async () => {
      const { job } = await invoke('window.secHubDesktop.getJob()');
      return job && ['completed', 'failed', 'cancelled'].includes(job.state) && job;
    }, 45_000, 'demo_scan_deadline');
    summary.demoScan = { ...summary.demoScan, state: demoJob.state, errorCode: demoJob.errorCode, runStatus: demoJob.runStatus, reportsReady: demoJob.reportsReady };
    if (demoJob.projectKind !== 'demo' || demoJob.state !== 'completed' || demoJob.runStatus !== 'completed' || !demoJob.reportsReady) throw Error('demo_scan_failed');
    const demoArtifact = await waitFor(() => invoke(`(async () => {
      if (document.body.dataset.desktopResults !== 'fresh'
        || document.querySelector('.scan-result-example h3')?.textContent !== 'Example scan results') return false;
      const { artifacts } = await (await fetch('/api/catalog')).json();
      const item = artifacts.find(({ summary }) => summary?.runId === ${JSON.stringify(demoJob.resultRunId)});
      if (item?.state !== 'ready' || item.summary.projectKind !== 'demo') return false;
      const { run } = await (await fetch('/api/artifacts/' + item.id)).json();
      return { id: item.id, kind: run?.projectKind, tools: run?.tools?.filter(({ selected }) => selected).map(({ id, status }) => ({ id, status })) };
    })()`), 7000, 'demo_report_not_opened');
    const realOsv = demoArtifact.kind === 'demo' && demoArtifact.tools?.length === 1
      && demoArtifact.tools[0].id === 'osv' && demoArtifact.tools[0].status === 'completed';
    const outsideDemoStatus = (await fetch(new URL(`api/artifacts/${demoArtifact.id}`, controller.current.url))).status;
    await invoke("document.querySelector('.scan-result-example button').click()", true);
    const nextFolderGuide = await invoke("document.body.dataset.desktopView === 'scan' && !document.getElementById('desktop-folder-guide').hidden");
    await click('desktop-guide-back');
    await click('desktop-nav-results');
    await click('desktop-results-history');
    const demoHistory = await waitFor(() => invoke(`document.body.dataset.desktopResults === 'history'
      && Array.from(document.querySelectorAll('#artifact-list button')).some((button) => button.textContent.includes('Example scan results'))`), 5000, 'demo_history_missing');
    summary.demoScan = { ...summary.demoScan, artifactId: demoArtifact.id, tools: demoArtifact.tools, outsideDemoStatus, nextFolderGuide, demoHistory };
    summary.checks.demoScan = realOsv && outsideDemoStatus === 404 && nextFolderGuide && demoHistory;
    if (!summary.checks.demoScan) throw Error('demo_scan_provenance_mismatch');
    const initial = controller.current.url;
    const selected = path.join(directory, 'controlled-results');
    await fs.mkdir(selected, { mode: 0o700 });
    const savedRun = JSON.parse(await fs.readFile(new URL('./sample/example/run.json', import.meta.url), 'utf8'));
    savedRun.id = 'controlled-saved-results';
    const dependency = savedRun.findings[0];
    dependency.location = { path: 'package-lock.json', package: 'npm:example', version: '1.0.0' };
    dependency.evidence = { affected: [{
      package: { name: 'example', ecosystem: 'npm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.1.0' }] }],
    }] };
    savedRun.tools[0].findings[0] = dependency;
    const codeFinding = {
      toolId: 'open-code-review', ruleId: 'UI-003', title: 'Example suggested code',
      severity: 'medium', verification: 'candidate', location: { path: 'src/example.mjs', line: 1 },
      evidence: { suggestionCode: 'validate("<fixture>");' },
    };
    savedRun.findings.push(codeFinding);
    savedRun.tools.push({ id: 'open-code-review', selected: true, status: 'completed', findings: [codeFinding] });
    await fs.writeFile(path.join(selected, 'run.json'), JSON.stringify(savedRun), { mode: 0o600 });
    selectFolder(selected);
    const switched = await actions.openSavedResults();
    const after = await inspectRenderer();
    const savedRoute = await waitFor(() => invoke(`location.hash === '#saved-results' && document.body.dataset.desktopResults === 'history'`), 5000, 'saved_results_route_missing');
    summary.checks.folderSwitch = savedRoute && switched === true && controller.current.url !== initial && controller.current.example === false && after.catalog.artifacts.some((item) => item.state === 'ready') && after.executionStatus === 404 && await portClosed(initial);
    summary.nativeTitles.savedResults = await inspectNativeTitle('Security Scan Hub — Saved results');
    summary.checks.folderSwitch &&= summary.nativeTitles.savedResults.preserved;
    summary.savedRecommendations = await bounded(window.webContents.executeJavaScript(`(async () => {
      document.querySelector('#artifact-list button')?.click();
      while (!document.querySelector('#finding-section .finding-select')) await new Promise((resolve) => setTimeout(resolve, 100));
      const visible = (element) => Boolean(element?.getClientRects().length);
      const rail = document.getElementById('desktop-nav-dependencies');
      const dependencyNavVisible = visible(rail);
      rail.click();
      const packageView = document.getElementById('desktop-dependencies');
      const packageRecord = packageView.querySelector('.dependency-record');
      const packageRecorded = visible(packageView) && rail.getAttribute('aria-current') === 'page'
        && packageRecord?.querySelector('.dependency-package')?.textContent === 'example 1.0.0'
        && packageRecord?.querySelector('.dependency-sources summary')?.textContent === 'package-lock.json';
      packageRecord?.querySelector('.dependency-findings summary')?.click();
      while (!packageRecord?.querySelector('.dependency-findings button')) await new Promise((resolve) => setTimeout(resolve, 100));
      packageRecord.querySelector('.dependency-findings button').click();
      const preview = document.querySelector('#evidence-content .evidence-preview');
      const guidance = preview?.querySelector('.evidence-view-guidance');
      const linkedPreview = visible(preview) && visible(guidance) && preview.textContent.includes('Example dependency advisory')
        && document.getElementById('desktop-nav-results').getAttribute('aria-current') === 'page';
      guidance?.click();
      const dependency = document.querySelector('#evidence-content .evidence-advisory');
      const fixedVersion = visible(dependency) && dependency.textContent.includes('fixed version (1.1.0)');
      document.getElementById('evidence-back').click();
      const previewRestored = visible(preview) && document.activeElement === guidance;
      Array.from(document.querySelectorAll('#finding-section .finding-select'))
        .find((button) => button.textContent.includes('Example suggested code'))?.click();
      const details = document.querySelector('#evidence-content .evidence-view-details');
      const detailActionVisible = visible(details);
      details?.click();
      const code = document.querySelector('#evidence-content .evidence-advisory');
      const suggestion = visible(code) && code.querySelector('pre')?.textContent === 'validate("<fixture>");';
      return { dependencyNavVisible, packageRecorded, linkedPreview, fixedVersion, previewRestored, detailActionVisible, suggestion };
    })()`), 7000, 'saved_recommendations_missing');
    if (!Object.values(summary.savedRecommendations).every((value) => value === true)) throw Error('saved_recommendations_mismatch');
    const project = path.join(directory, 'controlled-project');
    await fs.mkdir(project, { mode: 0o700 });
    // A pinned, harmless package coordinate exercises the official lookup without installing packages.
    await fs.writeFile(path.join(project, 'package-lock.json'), JSON.stringify({
      name: 'desktop-smoke', version: '1.0.0', lockfileVersion: 3, packages: {
        '': { name: 'desktop-smoke', version: '1.0.0', dependencies: { 'is-number': '7.0.0' } },
        'node_modules/is-number': { version: '7.0.0' },
      },
    }), { mode: 0o600 });
    window.focus();
    const initialState = await invoke('window.secHubDesktop.getState()');
    const withoutGesture = await invoke('window.secHubDesktop.chooseFolder()');
    await click('desktop-nav-home');
    await click('desktop-own-route');
    const folderGuide = await invoke(`!document.getElementById('desktop-folder-guide').hidden
      && document.getElementById('desktop-folder-guide').textContent.includes('package-lock.json')`);
    const unknownProject = path.join(directory, 'unknown-project');
    await fs.mkdir(unknownProject, { mode: 0o700 });
    selectFolder(unknownProject);
    await waitFor(() => invoke("!document.getElementById('desktop-guide-choose').disabled"), 5000, 'scan_controls_unavailable');
    await click('desktop-guide-choose');
    const unknownGuidance = await waitFor(() => invoke(`!document.getElementById('desktop-review').hidden
      && document.getElementById('desktop-project-guidance').dataset.state === 'not-detected'`), 5000, 'unknown_folder_guidance_missing');
    selectFolder(project);
    await click('desktop-choose-folder');
    const chosen = await waitFor(async () => {
      const state = await invoke(`({
        selected: document.getElementById('desktop-folder').textContent === 'controlled-project',
        guidance: document.getElementById('desktop-project-guidance').dataset.state,
        status: document.getElementById('execution-status').textContent,
      })`);
      summary.projectSelection = { ...state, folderGuide, unknownGuidance, withoutGesture: withoutGesture.error?.code };
      return state.selected && state.guidance === 'recognized';
    }, 5000, 'project_selection_failed');
    const selectedProject = await invoke('window.secHubDesktop.getState()');
    const basicScanReady = await invoke(`!document.getElementById('execution-start').disabled
      && document.getElementById('execution-start').textContent === 'Start basic scan'
      && !document.getElementById('desktop-advanced').open`);
    summary.projectSelection.basicScanReady = basicScanReady;
    if (!folderGuide || !basicScanReady || selectedProject.projectKind !== 'folder'
      || !selectedProject.projectGuidance?.examples.includes('package-lock.json')) throw Error('project_guidance_mismatch');
    const injected = await invoke("window.secHubDesktop.startScan({ toolIds: ['osv'], aiConsent: false, path: '/arbitrary' })", true);
    const phpUrl = 'http://127.0.0.1:8080/';
    const checker = path.join(directory, 'phpcheck.js');
    const config = path.join(directory, 'trusted-tools.json');
    const node = process.env.SEC_HUB_DESKTOP_SMOKE_NODE;
    if (!path.isAbsolute(node ?? '')) throw Error('fixture_node_missing');
    // Only the adapter transport is under test here. The fixture makes no HTTP request.
    await fs.writeFile(checker, `if (process.argv[2] === '--version') console.log('PHP checker fixture 1.0.0');
      else if (process.argv[2] === ${JSON.stringify(phpUrl)} && process.argv[3] === '--json') {
        console.log(JSON.stringify({patch_status:'potentially_vulnerable',php_version:'8.4.1',reason:'Controlled smoke finding',exit_code:1}));
        process.exitCode = 1;
      } else process.exitCode = 2;`, { mode: 0o600 });
    await fs.writeFile(config, JSON.stringify({ tools: { php2shell: { command: node, args: [checker] } } }), { mode: 0o600 });
    selectFolder(config);
    await invoke("document.getElementById('desktop-advanced').open = true; document.getElementById('desktop-config').open = true");
    await click('desktop-choose-config');
    const imported = await waitFor(() => invoke("document.getElementById('desktop-config-label').textContent === 'trusted-tools.json'"), 5000, 'config_import_failed');
    summary.nativeScan = {
      installed: initialState.tools?.some((tool) => tool.id === 'osv' && tool.installation === 'installed' && tool.selectable),
      withoutGesture: withoutGesture.error?.code,
      chosen,
      injected: injected.error?.code,
      configImported: imported,
    };
    if (!summary.nativeScan.installed || summary.nativeScan.withoutGesture !== 'forbidden'
      || !summary.nativeScan.chosen || summary.nativeScan.injected !== 'invalid_request' || !summary.nativeScan.configImported) throw Error('native_scan_admission_failed');
    await click('desktop-select-all');
    await invoke(`(() => {
      const input = document.getElementById('desktop-php-url');
      input.value = ${JSON.stringify(phpUrl)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await click('execution-start');
    const job = await waitFor(async () => {
      const { job } = await invoke('window.secHubDesktop.getJob()');
      return job?.id !== demoJob.id && job?.projectKind === 'folder' && ['completed', 'failed', 'cancelled'].includes(job.state) && job;
    }, 45_000, 'native_scan_deadline');
    const artifactId = await waitFor(() => invoke(`(async () => {
      const catalog = await (await fetch('/api/catalog')).json();
      const item = catalog.artifacts.find(({ summary }) => summary?.runId === ${JSON.stringify(job.resultRunId)});
      if (document.getElementById('detail-content').textContent.includes('Advertised PHP version may be vulnerable')) return item?.id;
    })()`), 7000, 'combined_report_not_opened');
    const artifact = artifactId && await invoke(`fetch('/api/artifacts/${artifactId}').then((response) => response.json())`);
    const browserStatus = artifactId && (await fetch(new URL(`api/artifacts/${artifactId}`, controller.current.url))).status;
    const tools = Object.fromEntries((artifact?.run?.tools ?? []).filter(({ selected }) => selected).map(({ id, status }) => [id, status]));
    const combinedFinding = artifact?.run?.findings?.some((finding) => finding.toolId === 'php2shell' && finding.ruleId === 'php2shell-header-version');
    const recommendationVisible = await invoke(`(() => {
      Array.from(document.querySelectorAll('#finding-section .finding-select'))
        .find((button) => button.textContent.includes('Advertised PHP version may be vulnerable'))?.click();
      const guidance = document.querySelector('#evidence-content .evidence-view-guidance');
      if (!guidance?.getClientRects().length) return false;
      guidance.click();
      if (!document.querySelector('#evidence-content .evidence-advisory')?.getClientRects().length) return false;
      const [check, action] = Array.from(document.querySelectorAll('#evidence-content .finding-action-steps > li'), (item) => item.textContent);
      return Boolean(check?.includes('Check first') && check.includes('actual PHP version')
        && action?.includes('Recommended action') && action.includes('If the installation is affected'));
    })()`);
    const storeReportOnDisk = !summary.runtime.windowsStore || (await fs.stat(path.join(directory, '.security-scan-hub', 'scan-results', job.id, 'report.html')).catch(() => null))?.isFile() === true;
    summary.nativeScan = { ...summary.nativeScan, state: job.state, errorCode: job.errorCode, runStatus: job.runStatus, reportsReady: job.reportsReady, artifactId, browserStatus, tools, combinedFinding, recommendationVisible, storeReportOnDisk };
    summary.checks.nativeScan = job.state === 'completed' && job.runStatus === 'completed' && job.reportsReady
      && tools.osv === 'completed' && tools.php2shell === 'completed' && combinedFinding && recommendationVisible && browserStatus === 404 && storeReportOnDisk;
    if (captureStoreListingScreenshot) {
      if (!summary.checks.nativeScan) throw Error('store_screenshot_requires_completed_native_scan');
      const originalSize = window.getContentSize();
      try {
        // Store screenshot diagnostics use only the controlled fixture above. Make the
        // rendered app viewport large enough for the listing requirement, then restore it.
        window.setContentSize(Math.max(1366, originalSize[0]), Math.max(768, originalSize[1]));
        await new Promise((resolve) => setTimeout(resolve, 250));
        const screenshot = await window.webContents.capturePage();
        const dimensions = screenshot.getSize();
        if (dimensions.width < 1366 || dimensions.height < 768) throw Error('store_screenshot_dimensions_too_small');
        const bytes = screenshot.toPNG();
        if (bytes.length === 0 || bytes.length > 50 * 1024 * 1024) throw Error('store_screenshot_size_invalid');
        const screenshotPath = path.join(directory, 'store-listing-screenshot.png');
        await fs.writeFile(screenshotPath, bytes, { flag: 'wx', mode: 0o600 });
        summary.storeListingScreenshot = { captured: true, filename: path.basename(screenshotPath), ...dimensions, bytes: bytes.length };
      } finally {
        window.setContentSize(originalSize[0], originalSize[1]);
      }
    }
    const secondEvent = secondInstance();
    secondary = spawn(process.execPath, ['--sec-hub-smoke', '--sec-hub-smoke-secondary'], { env: process.env, stdio: 'ignore', windowsHide: true });
    secondaryExit = new Promise((resolve, reject) => {
      secondary.once('error', () => reject(Error('secondary_launch_failed')));
      secondary.once('exit', (code, signal) => { summary.secondary = { exitCode: code, signal }; resolve(code); });
    });
    const [exitCode] = await bounded(Promise.all([secondaryExit, secondEvent]), 12_000, 'secondary_instance_timeout');
    summary.checks.singleInstance = exitCode === 0 && summary.secondary.signal === null;
  } catch (error) {
    summary.error = typeof error?.message === 'string' && /^[a-z_]+$/.test(error.message) ? error.message : 'packaged_runtime_self_test_failed';
  } finally {
    try { await stopSecondary(secondary, secondaryExit); }
    catch { summary.error = 'packaged_secondary_cleanup_failed'; }
    try { await bounded(closeWindow(), 15_000, 'shutdown_timeout'); }
    catch { summary.error = 'packaged_runtime_shutdown_failed'; }
    summary.checks.closedPort = urls.length > 0 && (await Promise.all(urls.map(portClosed))).every(Boolean);
    if (Object.values(summary.checks).every((value) => value === true) && !summary.error) summary.status = 'passed';
    await fs.writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  return summary.status === 'passed' ? 0 : 1;
}
