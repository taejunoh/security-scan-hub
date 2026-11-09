import test from 'node:test';
import assert from 'node:assert/strict';
import { appxManifest, brandPng, validateIdentity, validateVersion } from '../msix/build.mjs';

test('MSIX identity requires a valid package name and publisher distinguished name', () => {
  assert.deepEqual(validateIdentity({
    name: 'TaejunOh.SecurityScanHub',
    publisher: 'CN=Example Publisher, O=Example, C=US',
    publisherDisplayName: 'Example Publisher',
    displayName: 'Security Scan Hub',
  }), {
    name: 'TaejunOh.SecurityScanHub',
    publisher: 'CN=Example Publisher, O=Example, C=US',
    publisherDisplayName: 'Example Publisher',
    displayName: 'Security Scan Hub',
  });
  assert.throws(() => validateIdentity({ name: 'bad name', publisher: 'CN=Example', publisherDisplayName: 'Example', displayName: 'Security Scan Hub' }), /identity name/i);
  assert.throws(() => validateIdentity({ name: 'Valid.Name', publisher: 'Example Publisher', publisherDisplayName: 'Example', displayName: 'Security Scan Hub' }), /publisher/i);
  assert.throws(() => validateIdentity({ name: 'Valid.Name', publisher: 'CN=Example', publisherDisplayName: '', displayName: 'Security Scan Hub' }), /publisher display name/i);
  assert.throws(() => validateIdentity({ name: 'Valid.Name', publisher: 'CN=Example', publisherDisplayName: 'Example', displayName: '' }), /display name/i);
});

test('MSIX version is a bounded four-part numeric version ending in zero', () => {
  assert.equal(validateVersion('1.2.4.0'), '1.2.4.0');
  for (const version of ['0.2.4.0', '0.2.4', '1.2.4.1', '01.2.4.0', '1.2.4.65536', '1.2.-1.0']) {
    assert.throws(() => validateVersion(version), /version/i, version);
  }
});

test('Store manifest keeps the app title separate from the verified publisher name', () => {
  const identity = validateIdentity({
    name: 'TaejunOh.SecurityScanHub',
    publisher: 'CN=Example Publisher, O=Example, C=US',
    publisherDisplayName: 'Taejun Oh',
    displayName: 'Security & Scan Hub',
  });
  const manifest = appxManifest(identity, validateVersion('1.2.4.0'));
  assert.match(manifest, /PublisherDisplayName>Taejun Oh</);
  assert.match(manifest, /DisplayName>Security &amp; Scan Hub</);
  assert.match(manifest, /Name="runFullTrust"/);
  assert.match(manifest, /IgnorableNamespaces="uap desktop rescap"/);
});

test('generated Store tiles are PNG images at the dimensions named by the package manifest', () => {
  for (const size of [44, 50, 150]) {
    const logo = brandPng(size);
    assert.deepEqual(logo.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(logo.readUInt32BE(16), size);
    assert.equal(logo.readUInt32BE(20), size);
  }
});
