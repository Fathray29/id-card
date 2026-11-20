/**
 * Zero-dependency preset schema constants, domain/share-link helpers, and strict
 * payload validators shared between the React client and the Vercel/Express API.
 */

export type FitMode = 'cover' | 'contain' | 'stretch';
export type CardFinish = 'glossy' | 'matte';
export type EdgeMaterialPreset = 'white' | 'black' | 'gold' | 'silver';
export type HardwareFinish = 'brushed-steel' | 'matte-black' | 'champagne-gold';
export type CardCaseStyle =
  | 'matte-obsidian'
  | 'frosted-clear'
  | 'glacier-white'
  | 'slate-aluminum'
  | 'cobalt-frame';
export type SampleTemplateId = 'tech-vip' | 'corporate-sec' | 'minimal-staff';

export const MAX_PRESETS_PER_USER = 10;
export const MAX_PRESETS_PER_ADMIN = 100;
export const CUSTOM_SHARE_DOMAIN = 'rayyan29.eu.org';
export const CUSTOM_SHARE_ORIGIN = `https://${CUSTOM_SHARE_DOMAIN}`;

export type ShareOriginMode = 'custom' | 'current';

export const PRESET_LIMITS = {
  titleMinLength: 1,
  titleMaxLength: 80,
  descriptionMaxLength: 200,
  authorNameMinLength: 1,
  authorNameMaxLength: 60,
  idMaxLength: 128,
  idPattern: /^[a-zA-Z0-9_-]+$/,
  hexColorPattern: /^#[0-9a-fA-F]{3,8}$/,
  fileNameMaxLength: 120,
  artworkDataUrlMaxLength: 240_000,
  thumbnailDataUrlMaxLength: 45_000,
  dataUrlPrefixPattern: /^data:image\/(webp|jpeg|png);base64,/,
} as const;

export const ALLOWED_FIT_MODES: readonly FitMode[] = ['cover', 'contain', 'stretch'];
export const ALLOWED_ROTATIONS: readonly (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
export const ALLOWED_TEMPLATES: readonly SampleTemplateId[] = [
  'tech-vip',
  'corporate-sec',
  'minimal-staff',
];
export const ALLOWED_FINISHES: readonly CardFinish[] = ['glossy', 'matte'];
export const ALLOWED_CASE_STYLES: readonly CardCaseStyle[] = [
  'matte-obsidian',
  'frosted-clear',
  'glacier-white',
  'slate-aluminum',
  'cobalt-frame',
];
export const ALLOWED_EDGES: readonly EdgeMaterialPreset[] = ['white', 'black', 'gold', 'silver'];
export const ALLOWED_HARDWARE: readonly HardwareFinish[] = [
  'brushed-steel',
  'matte-black',
  'champagne-gold',
];
export const ALLOWED_BACKDROPS = ['obsidian', 'slate', 'studio-light'] as const;
export type StudioBackdropPreset = (typeof ALLOWED_BACKDROPS)[number];

export interface LayerPresetData {
  fitMode: FitMode;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: 0 | 90 | 180 | 270;
  backgroundColor: string;
  lanyardRepeat: number;
  uploadedFileName: string;
  artworkDataUrl: string;
}

export interface StudioPresetConfigData {
  activeTemplate: SampleTemplateId;
  cardFinish: CardFinish;
  cardCaseEnabled: boolean;
  cardCaseStyle: CardCaseStyle;
  edgePreset: EdgeMaterialPreset;
  hardwareFinish: HardwareFinish;
  hologramEnabled: boolean;
  hologramIntensity: number;
  studioBackdrop: StudioBackdropPreset;
  showLanyard: boolean;
  front: LayerPresetData;
  back: LayerPresetData;
  lanyard: LayerPresetData;
}

export interface CardPresetRecord {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  authorName: string;
  isPublic: boolean;
  thumbnailDataUrl: string;
  config: StudioPresetConfigData;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PresetValidationResult {
  valid: boolean;
  errors: string[];
}

export function sanitizeHexColor(hex: string, fallback = '#0c1122'): string {
  const trimmed = (hex || '').trim();
  return PRESET_LIMITS.hexColorPattern.test(trimmed) ? trimmed : fallback;
}

export function sanitizeAuthorName(name: string | null | undefined): string {
  const cleaned = (name || 'Studio Creator').trim().replace(/\s+/g, ' ');
  const sliced = cleaned.slice(0, PRESET_LIMITS.authorNameMaxLength);
  return sliced.length >= 1 ? sliced : 'Studio Creator';
}

export function generatePresetId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 10; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `badge_${Date.now().toString(36)}_${suffix}`;
}

export function isCustomDomainHost(hostname: string): boolean {
  const lower = (hostname || '').trim().toLowerCase();
  return lower === CUSTOM_SHARE_DOMAIN || lower.endsWith(`.${CUSTOM_SHARE_DOMAIN}`);
}

export function resolveShareOrigin(mode: ShareOriginMode, currentOrigin: string): string {
  if (mode === 'custom') return CUSTOM_SHARE_ORIGIN;
  try {
    const parsed = new URL(currentOrigin);
    return parsed.origin;
  } catch {
    return CUSTOM_SHARE_ORIGIN;
  }
}

export function buildPresetShareUrl(presetId: string, origin: string, pathname = '/'): string {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(cleanPath, origin);
  url.searchParams.set('preset', presetId);
  return url.toString();
}

export function extractPresetIdFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const id = params.get('preset')?.trim() ?? '';
    if (!id || id.length > PRESET_LIMITS.idMaxLength || !PRESET_LIMITS.idPattern.test(id)) {
      return null;
    }
    return id;
  } catch {
    return null;
  }
}

export function extractPresetIdFromInput(rawInput: string): string | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  if (trimmed.includes('preset=')) {
    try {
      const url =
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? new URL(trimmed)
          : new URL(
              trimmed.startsWith('?')
                ? `https://${CUSTOM_SHARE_DOMAIN}/${trimmed}`
                : `https://${trimmed}`
            );
      return extractPresetIdFromSearch(url.search);
    } catch {
      const idx = trimmed.indexOf('?');
      if (idx >= 0) {
        return extractPresetIdFromSearch(trimmed.slice(idx));
      }
      return null;
    }
  }

  if (trimmed.length <= PRESET_LIMITS.idMaxLength && PRESET_LIMITS.idPattern.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function validateLayerPreset(
  layer: unknown,
  label: string
): PresetValidationResult {
  const errors: string[] = [];
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
    return { valid: false, errors: [`${label} must be an object`] };
  }
  const obj = layer as Record<string, unknown>;
  const expectedKeys = [
    'fitMode',
    'scale',
    'offsetX',
    'offsetY',
    'rotation',
    'backgroundColor',
    'lanyardRepeat',
    'uploadedFileName',
    'artworkDataUrl',
  ];
  for (const k of expectedKeys) {
    if (!(k in obj)) errors.push(`${label}.${k} is required`);
  }
  for (const k of Object.keys(obj)) {
    if (!expectedKeys.includes(k)) errors.push(`${label}.${k} is not allowed`);
  }

  if (typeof obj.fitMode !== 'string' || !ALLOWED_FIT_MODES.includes(obj.fitMode as FitMode)) {
    errors.push(`${label}.fitMode is invalid`);
  }
  if (typeof obj.scale !== 'number' || !Number.isFinite(obj.scale) || obj.scale < 0.5 || obj.scale > 2.5) {
    errors.push(`${label}.scale must be between 0.5 and 2.5`);
  }
  if (typeof obj.offsetX !== 'number' || !Number.isFinite(obj.offsetX) || obj.offsetX < -1 || obj.offsetX > 1) {
    errors.push(`${label}.offsetX must be between -1 and 1`);
  }
  if (typeof obj.offsetY !== 'number' || !Number.isFinite(obj.offsetY) || obj.offsetY < -1 || obj.offsetY > 1) {
    errors.push(`${label}.offsetY must be between -1 and 1`);
  }
  if (
    typeof obj.rotation !== 'number' ||
    !Number.isInteger(obj.rotation) ||
    !ALLOWED_ROTATIONS.includes(obj.rotation as 0 | 90 | 180 | 270)
  ) {
    errors.push(`${label}.rotation must be 0, 90, 180, or 270`);
  }
  if (
    typeof obj.backgroundColor !== 'string' ||
    !PRESET_LIMITS.hexColorPattern.test(obj.backgroundColor)
  ) {
    errors.push(`${label}.backgroundColor must be a valid hex color`);
  }
  if (
    typeof obj.lanyardRepeat !== 'number' ||
    !Number.isInteger(obj.lanyardRepeat) ||
    obj.lanyardRepeat < 1 ||
    obj.lanyardRepeat > 8
  ) {
    errors.push(`${label}.lanyardRepeat must be an integer between 1 and 8`);
  }
  if (
    typeof obj.uploadedFileName !== 'string' ||
    obj.uploadedFileName.length > PRESET_LIMITS.fileNameMaxLength
  ) {
    errors.push(`${label}.uploadedFileName exceeds max length`);
  }
  if (
    typeof obj.artworkDataUrl !== 'string' ||
    obj.artworkDataUrl.length > PRESET_LIMITS.artworkDataUrlMaxLength ||
    (obj.artworkDataUrl !== '' && !PRESET_LIMITS.dataUrlPrefixPattern.test(obj.artworkDataUrl))
  ) {
    errors.push(`${label}.artworkDataUrl is invalid or exceeds 240KB limit`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateStudioPresetConfig(config: unknown): PresetValidationResult {
  const errors: string[] = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['config must be an object'] };
  }
  const cfg = config as Record<string, unknown>;
  const expectedKeys = [
    'activeTemplate',
    'cardFinish',
    'cardCaseEnabled',
    'cardCaseStyle',
    'edgePreset',
    'hardwareFinish',
    'hologramEnabled',
    'hologramIntensity',
    'studioBackdrop',
    'showLanyard',
    'front',
    'back',
    'lanyard',
  ];
  for (const k of expectedKeys) {
    if (!(k in cfg)) errors.push(`config.${k} is required`);
  }
  for (const k of Object.keys(cfg)) {
    if (!expectedKeys.includes(k)) errors.push(`config.${k} is not allowed`);
  }

  if (!ALLOWED_TEMPLATES.includes(cfg.activeTemplate as SampleTemplateId)) {
    errors.push('config.activeTemplate is invalid');
  }
  if (!ALLOWED_FINISHES.includes(cfg.cardFinish as CardFinish)) {
    errors.push('config.cardFinish is invalid');
  }
  if (typeof cfg.cardCaseEnabled !== 'boolean') {
    errors.push('config.cardCaseEnabled must be boolean');
  }
  if (!ALLOWED_CASE_STYLES.includes(cfg.cardCaseStyle as CardCaseStyle)) {
    errors.push('config.cardCaseStyle is invalid');
  }
  if (!ALLOWED_EDGES.includes(cfg.edgePreset as EdgeMaterialPreset)) {
    errors.push('config.edgePreset is invalid');
  }
  if (!ALLOWED_HARDWARE.includes(cfg.hardwareFinish as HardwareFinish)) {
    errors.push('config.hardwareFinish is invalid');
  }
  if (typeof cfg.hologramEnabled !== 'boolean') {
    errors.push('config.hologramEnabled must be boolean');
  }
  if (
    typeof cfg.hologramIntensity !== 'number' ||
    !Number.isFinite(cfg.hologramIntensity) ||
    cfg.hologramIntensity < 0.2 ||
    cfg.hologramIntensity > 1.0
  ) {
    errors.push('config.hologramIntensity must be between 0.2 and 1.0');
  }
  if (!ALLOWED_BACKDROPS.includes(cfg.studioBackdrop as StudioBackdropPreset)) {
    errors.push('config.studioBackdrop is invalid');
  }
  if (typeof cfg.showLanyard !== 'boolean') {
    errors.push('config.showLanyard must be boolean');
  }

  for (const layerKey of ['front', 'back', 'lanyard'] as const) {
    const res = validateLayerPreset(cfg[layerKey], `config.${layerKey}`);
    errors.push(...res.errors);
  }

  return { valid: errors.length === 0, errors };
}

export function validatePresetMutationInput(input: unknown): PresetValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Preset payload must be an object'] };
  }
  const data = input as Record<string, unknown>;
  const expectedKeys = ['title', 'description', 'isPublic', 'thumbnailDataUrl', 'config'];
  for (const k of expectedKeys) {
    if (!(k in data)) errors.push(`${k} is required`);
  }
  for (const k of Object.keys(data)) {
    if (!expectedKeys.includes(k)) errors.push(`Unexpected field: ${k}`);
  }

  if (
    typeof data.title !== 'string' ||
    data.title.trim().length < PRESET_LIMITS.titleMinLength ||
    data.title.length > PRESET_LIMITS.titleMaxLength
  ) {
    errors.push('Title must be between 1 and 80 characters');
  }
  if (typeof data.description !== 'string' || data.description.length > PRESET_LIMITS.descriptionMaxLength) {
    errors.push('Description must be at most 200 characters');
  }
  if (typeof data.isPublic !== 'boolean') {
    errors.push('isPublic must be boolean');
  }
  if (
    typeof data.thumbnailDataUrl !== 'string' ||
    data.thumbnailDataUrl.length > PRESET_LIMITS.thumbnailDataUrlMaxLength ||
    (data.thumbnailDataUrl !== '' && !PRESET_LIMITS.dataUrlPrefixPattern.test(data.thumbnailDataUrl))
  ) {
    errors.push('thumbnailDataUrl is invalid or exceeds 45KB');
  }

  const cfgCheck = validateStudioPresetConfig(data.config);
  errors.push(...cfgCheck.errors);

  return { valid: errors.length === 0, errors };
}
