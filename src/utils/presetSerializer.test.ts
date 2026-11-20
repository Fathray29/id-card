import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESET_LIMITS,
  buildPresetShareUrl,
  extractPresetIdFromSearch,
  generatePresetId,
  sanitizeAuthorName,
  sanitizeHexColor,
} from './presetSerializer';
import { createInitialSpringState, stepOfflinePresetFrame } from './physicsEngine';

test('preset share URL builder and search parser round-trip valid IDs and reject poisoned IDs', () => {
  const id = generatePresetId();
  assert.equal(PRESET_LIMITS.idPattern.test(id), true);

  const shareUrl = buildPresetShareUrl(id, 'https://badgeforge.example.com', '/');
  const parsed = new URL(shareUrl);
  assert.equal(extractPresetIdFromSearch(parsed.search), id);

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
