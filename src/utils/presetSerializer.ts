/**
 * Preset serialization helpers (canvas artwork compression + front thumbnail generation)
 * paired with re-exported shared validation & share-link utilities.
 */

import type { LayerId, LayerTransform, SampleTemplateId } from '../store/useStudioStore';
import { renderLayerToCanvas } from './texturePipeline';
import {
  ALLOWED_FIT_MODES,
  ALLOWED_ROTATIONS,
  PRESET_LIMITS,
  sanitizeHexColor,
  type LayerPresetData,
} from './presetValidation';

export * from './presetValidation';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode artwork image'));
    img.src = src;
  });
}

/**
 * Compresses an uploaded layer image to a crisp, strictly-bounded WebP/JPEG data URL
 * guaranteed <= maxChars so shared presets stay lightweight and load fast across devices.
 */
export async function compressArtworkDataUrl(
  imageUrl: string | null,
  layerId: LayerId,
  maxChars = 190_000
): Promise<string> {
  if (!imageUrl) return '';
  if (typeof document === 'undefined') return '';

  const img = await loadImageElement(imageUrl);
  const maxW = layerId === 'lanyard' ? 1600 : 640;
  const maxH = layerId === 'lanyard' ? 120 : 1014;
  const scale = Math.min(
    1,
    maxW / Math.max(1, img.naturalWidth),
    maxH / Math.max(1, img.naturalHeight)
  );

  let targetW = Math.max(16, Math.round(img.naturalWidth * scale));
  let targetH = Math.max(16, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const mimeCandidates: Array<'image/webp' | 'image/jpeg'> = ['image/webp', 'image/jpeg'];
  const qualities = [0.84, 0.72, 0.58, 0.44];

  for (let pass = 0; pass < 3; pass++) {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const mime of mimeCandidates) {
      for (const q of qualities) {
        const dataUrl = canvas.toDataURL(mime, q);
        if (
          dataUrl.length <= maxChars &&
          PRESET_LIMITS.dataUrlPrefixPattern.test(dataUrl)
        ) {
          return dataUrl;
        }
      }
    }

    targetW = Math.max(16, Math.round(targetW * 0.72));
    targetH = Math.max(16, Math.round(targetH * 0.72));
  }

  return '';
}

/**
 * Generates a crisp, lightweight 160x254 JPEG thumbnail of the front ID card
 * for instant display in the My Presets & Moderation views.
 */
export async function generateFrontThumbnailDataUrl(
  frontLayer: LayerTransform,
  activeTemplate: SampleTemplateId
): Promise<string> {
  if (typeof document === 'undefined') return '';
  try {
    const fullCanvas = document.createElement('canvas');
    let img: HTMLImageElement | null = null;
    if (frontLayer.uploadedImageUrl) {
      img = await loadImageElement(frontLayer.uploadedImageUrl);
    }
    renderLayerToCanvas(fullCanvas, 'front', frontLayer, activeTemplate, img);

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 254;
    const tctx = thumbCanvas.getContext('2d');
    if (!tctx) return '';
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.78);
    if (
      thumbUrl.length <= PRESET_LIMITS.thumbnailDataUrlMaxLength &&
      PRESET_LIMITS.dataUrlPrefixPattern.test(thumbUrl)
    ) {
      return thumbUrl;
    }
    return '';
  } catch {
    return '';
  }
}

export async function serializeLayerForPreset(
  layerId: LayerId,
  layer: LayerTransform
): Promise<LayerPresetData> {
  const artworkDataUrl = await compressArtworkDataUrl(layer.uploadedImageUrl, layerId);
  return {
    fitMode: ALLOWED_FIT_MODES.includes(layer.fitMode) ? layer.fitMode : 'cover',
    scale: Number(clamp(layer.scale, 0.5, 2.5).toFixed(3)),
    offsetX: Number(clamp(layer.offsetX, -1, 1).toFixed(3)),
    offsetY: Number(clamp(layer.offsetY, -1, 1).toFixed(3)),
    rotation: ALLOWED_ROTATIONS.includes(layer.rotation) ? layer.rotation : 0,
    backgroundColor: sanitizeHexColor(layer.backgroundColor),
    lanyardRepeat: Math.round(clamp(layer.lanyardRepeat, 1, 8)),
    uploadedFileName: artworkDataUrl
      ? (layer.uploadedFileName || 'artwork.png').slice(0, PRESET_LIMITS.fileNameMaxLength)
      : '',
    artworkDataUrl,
  };
}
