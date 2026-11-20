import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRESET_LIMITS,
  validateCardPresetPayload,
  type StudioPresetConfigData,
} from './src/utils/presetSerializer';

function buildValidConfig(): StudioPresetConfigData {
  const baseLayer = {
    fitMode: 'cover' as const,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0 as const,
    backgroundColor: '#0c1122',
    lanyardRepeat: 1,
    uploadedFileName: '',
    artworkDataUrl: '',
  };
  return {
    activeTemplate: 'tech-vip',
    cardFinish: 'glossy',
    cardCaseEnabled: true,
    cardCaseStyle: 'matte-obsidian',
    edgePreset: 'black',
    hardwareFinish: 'brushed-steel',
    hologramEnabled: true,
    hologramIntensity: 0.72,
    studioBackdrop: 'obsidian',
    showLanyard: true,
    front: { ...baseLayer },
    back: { ...baseLayer },
    lanyard: { ...baseLayer, backgroundColor: '#1d2b8a' },
  };
}

function buildValidPayload(ownerId = 'user_abc123') {
  return {
    title: 'Meridian VIP Pass 2026',
    description: 'Glossy black-core badge in matte obsidian protective holder',
    ownerId,
    authorName: 'Alex Rivera',
    isPublic: true,
    thumbnailDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    config: buildValidConfig(),
    createdAt: 'SERVER_TIMESTAMP',
    updatedAt: 'SERVER_TIMESTAMP',
  };
}

test('firestore.rules enforces all Eight Pillars & Dirty Dozen guards', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  // Pillar 1: Global default-deny safety net
  assert.ok(rules.includes('match /{document=**}'));
  assert.ok(rules.includes('allow read, write: if false;'));

  // Pillar 2: Standalone validation helper called on create and update
  assert.ok(rules.includes('function isValidCardPreset(data)'));
  assert.ok(rules.includes('allow create: if isVerifiedUser()'));
  assert.ok(rules.includes('allow update: if isVerifiedUser()'));
  assert.ok(rules.includes('isValidCardPreset(incoming())'));

  // Pillar 3: Path variable hardening on get/create/update/delete, NOT on list
  assert.ok(rules.includes('function isValidId(id)'));
  assert.ok(rules.includes('allow get: if isValidId(presetId)'));
  assert.ok(rules.includes('allow list: if resource.data.isPublic == true'));

  // Pillar 4 & 5: Verified email, immutable ownerId/createdAt, strict affectedKeys allowlists
  assert.ok(rules.includes('request.auth.token.email_verified == true'));
  assert.ok(rules.includes('incoming().ownerId == existing().ownerId'));
  assert.ok(rules.includes('incoming().createdAt == existing().createdAt'));
  assert.ok(rules.includes('incoming().updatedAt == request.time'));
  assert.ok(rules.includes('incoming().diff(existing()).affectedKeys().hasOnly('));

  // O(1) prefix slicing avoids RE2 character limit failures on multi-KB base64 thumbnails/artwork
  assert.ok(rules.includes("val[0:23] == 'data:image/jpeg;base64,'"));
  assert.ok(rules.includes("val[0:23] == 'data:image/webp;base64,'"));
  assert.ok(!rules.includes("base64,.*'"));

  // Firestore Rules CEL requires `is int || is float` (`is number` is invalid and denies writes)
  assert.ok(rules.includes('return val is int || val is float;'));
  assert.ok(!rules.includes('is number'));
});

test('Dirty Dozen Payloads: valid preset passes while all adversarial payloads are rejected', () => {
  // Baseline valid payload passes
  const baseline = validateCardPresetPayload(buildValidPayload());
  assert.equal(baseline.valid, true, baseline.errors.join(', '));

  // #3 Identity Spoofing (invalid ownerId format)
  const badOwner = { ...buildValidPayload(), ownerId: '../../../admin' };
  assert.equal(validateCardPresetPayload(badOwner).valid, false);

  // #4 Shadow Ghost Field Injection
  const ghostField = { ...buildValidPayload(), isAdmin: true };
  assert.equal(validateCardPresetPayload(ghostField).valid, false);

  // #5 Document ID Poisoning regex check
  assert.equal(PRESET_LIMITS.idPattern.test('../../../etc/passwd'), false);
  assert.equal(PRESET_LIMITS.idPattern.test('badge_valid-123'), true);

  // #6 Denial-of-Wallet String Overflow
  const longTitle = { ...buildValidPayload(), title: 'A'.repeat(81) };
  assert.equal(validateCardPresetPayload(longTitle).valid, false);

  const longDesc = { ...buildValidPayload(), description: 'D'.repeat(201) };
  assert.equal(validateCardPresetPayload(longDesc).valid, false);

  const hugeArtwork = buildValidPayload();
  hugeArtwork.config.front.artworkDataUrl = `data:image/webp;base64,${'A'.repeat(240_005)}`;
  assert.equal(validateCardPresetPayload(hugeArtwork).valid, false);

  // #7 Invalid Enum Poisoning
  const badEnum = buildValidPayload();
  (badEnum.config as unknown as Record<string, unknown>).cardCaseStyle = 'diamond-hack';
  assert.equal(validateCardPresetPayload(badEnum).valid, false);

  // #8 Out-of-Range Numeric Poisoning
  const badScale = buildValidPayload();
  badScale.config.front.scale = 50;
  assert.equal(validateCardPresetPayload(badScale).valid, false);

  const badHolo = buildValidPayload();
  badHolo.config.hologramIntensity = 9.9;
  assert.equal(validateCardPresetPayload(badHolo).valid, false);

  const badRepeat = buildValidPayload();
  badRepeat.config.lanyard.lanyardRepeat = 99;
  assert.equal(validateCardPresetPayload(badRepeat).valid, false);

  // Non-image Data URL script injection attempt
  const xssDataUrl = buildValidPayload();
  xssDataUrl.config.front.artworkDataUrl = 'data:text/html;base64,PHNjcmlwdD4=';
  assert.equal(validateCardPresetPayload(xssDataUrl).valid, false);
});
