import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_SHARE_ORIGIN,
  MAX_PRESETS_PER_USER,
  PRESET_LIMITS,
  buildPresetShareUrl,
  extractPresetIdFromInput,
  extractPresetIdFromSearch,
  generatePresetId,
  isCustomDomainHost,
  resolveShareOrigin,
  sanitizeAuthorName,
  sanitizeHexColor,
} from './presetSerializer';
import { createInitialSpringState, stepOfflinePresetFrame } from './physicsEngine';

test('preset share URL builder, rayyan29.eu.org domain resolver, and link parser round-trip safely', () => {
  const id = generatePresetId();
  assert.equal(PRESET_LIMITS.idPattern.test(id), true);
  assert.equal(MAX_PRESETS_PER_USER, 10);

  // Custom domain allowlist & share origin resolution
  assert.equal(isCustomDomainHost('rayyan29.eu.org'), true);
  assert.equal(isCustomDomainHost('studio.rayyan29.eu.org'), true);
  assert.equal(isCustomDomainHost('evil-rayyan29.eu.org.attacker.com'), false);
  assert.equal(resolveShareOrigin('custom', 'http://localhost:3000'), CUSTOM_SHARE_ORIGIN);
  assert.equal(resolveShareOrigin('current', 'http://localhost:3000'), 'http://localhost:3000');

  const shareUrl = buildPresetShareUrl(id, CUSTOM_SHARE_ORIGIN, '/');
  assert.equal(shareUrl, `https://rayyan29.eu.org/?preset=${id}`);
  const parsed = new URL(shareUrl);
  assert.equal(extractPresetIdFromSearch(parsed.search), id);

  // Open Link input parser handles full URL, query string, bare ID, and rejects poisoned values
  assert.equal(extractPresetIdFromInput(shareUrl), id);
  assert.equal(extractPresetIdFromInput(`rayyan29.eu.org/?preset=${id}`), id);
  assert.equal(extractPresetIdFromInput(`?preset=${id}`), id);
  assert.equal(extractPresetIdFromInput(id), id);
  assert.equal(extractPresetIdFromInput('https://rayyan29.eu.org/?preset=../../etc/passwd'), null);
  assert.equal(extractPresetIdFromInput('../../../etc/passwd'), null);

  // Reject path traversal or invalid characters
  assert.equal(extractPresetIdFromSearch('?preset=../../etc/passwd'), null);
  assert.equal(extractPresetIdFromSearch('?preset=<script>alert(1)</script>'), null);
  assert.equal(extractPresetIdFromSearch('?other=123'), null);
});

test('sanitizeAuthorName and sanitizeHexColor enforce blueprint constraints', () => {
  assert.equal(sanitizeAuthorName('   '), 'Studio Creator');
  assert.equal(sanitizeAuthorName('A'.repeat(100)).length, PRESET_LIMITS.authorNameMaxLength);
  assert.equal(sanitizeHexColor('#0c1122'), '#0c1122');
  assert.equal(sanitizeHexColor('javascript:alert(1)'), '#0c1122');
});

test('24fps offline cinema preset stepping produces exact deterministic 384f (16s) & 576f (24s) loops', () => {
  const fps = 24;
  const total16s = 16 * fps; // 384 frames
  const total24s = 24 * fps; // 576 frames

  const start = stepOfflinePresetFrame(createInitialSpringState(), 'cinematic-reel', 0, total16s, fps);
  const end = stepOfflinePresetFrame(createInitialSpringState(), 'cinematic-reel', total16s, total16s, fps);

  assert.ok(start.cameraPose && end.cameraPose);
  assert.ok(Math.abs(start.cameraPose.position.x - end.cameraPose.position.x) < 1e-4);
  assert.ok(Math.abs(start.cameraPose.position.y - end.cameraPose.position.y) < 1e-4);
  assert.ok(Math.abs(start.cameraPose.position.z - end.cameraPose.position.z) < 1e-4);

  const comboStart = stepOfflinePresetFrame(createInitialSpringState(), 'cinematic-360', 0, total24s, fps);
  const comboEnd = stepOfflinePresetFrame(createInitialSpringState(), 'cinematic-360', total24s, total24s, fps);
  assert.ok(comboStart.cameraPose && comboEnd.cameraPose);
  assert.ok(Math.abs(comboStart.cameraPose.position.z - comboEnd.cameraPose.position.z) < 1e-4);
});
