import path from 'node:path';

// Only a server URL returned by the main-process controller establishes trust.
function ownedOrigin(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]*\/$/.test(value)) return null;
  try {
    const url = new URL(value);
    return Number(url.port) > 0 && url.origin + '/' === value ? url.origin : null;
  } catch { return null; }
}

export function isOwnedUrl(value, ownedUrl) {
  const origin = ownedOrigin(ownedUrl);
  if (!origin || typeof value !== 'string' || !value.startsWith(`${origin}/`)) return false;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}

export function browserUrl(value, ownedUrl) {
  return isOwnedUrl(value, ownedUrl) ? value : null;
}

function isDesktopPage(value, ownedUrl) {
  return isOwnedUrl(value, ownedUrl)
    && [ownedUrl, `${ownedUrl}#saved-results`, `${ownedUrl}#saved-example`].includes(value);
}

export function advisoryBrowserUrl(value, source, ownedUrl) {
  return isDesktopPage(source, ownedUrl)
    && typeof value === 'string' && /^https:\/\/osv\.dev\/vulnerability\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    ? value : null;
}

export function isTrustedSender(event, contents, session, activeUrl) {
  if (!contents || contents.isDestroyed() || event.sender !== contents || contents.session !== session) return false;
  const frame = event.senderFrame;
  return Boolean(frame && frame === contents.mainFrame && isDesktopPage(frame.url, activeUrl));
}

export function scanResultsPath({ windowsStore, home, userData }) {
  if (windowsStore) return path.join(home, '.security-scan-hub', 'scan-results');
  return path.join(userData, 'scan-results');
}
