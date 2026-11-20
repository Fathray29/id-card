/**
 * Pure, deterministic math utilities for:
 *  - 12-Megapixel (12MP) offline still resolutions & tiled sub-frustum partitioning
 *  - 2x2 Rotated-Grid Super-Sampling (RGSS) sub-pixel anti-aliasing offsets
 *  - Temporal supersampling motion blur shutter kernels (Tukey / cosine-tapered weights)
 */

import type { ExportAspectRatio } from './physicsEngine';

export type MotionBlurQuality = 'off' | 'cinema' | 'ultra';
export type ShutterAngleDeg = 90 | 180 | 270;

export interface StillResolutionSpec {
  width: number;
  height: number;
  megapixels: number;
  label: string;
  shortLabel: string;
}

/**
 * True ~12 Megapixel (12MP) calibrated studio still resolutions across all 3 aspect ratios.
 * Every dimension is divisible by 8/16 for clean tile subdivision & encoder alignment.
 */
export const STILL_12MP_RESOLUTIONS: Record<ExportAspectRatio, StillResolutionSpec> = {
  '16:9': {
    width: 4608,
    height: 2592,
    megapixels: 11.94,
    label: '16:9 Studio 12MP (4608×2592)',
    shortLabel: '16:9 12MP',
  },
  '9:16': {
    width: 2592,
    height: 4608,
    megapixels: 11.94,
    label: '9:16 Poster 12MP (2592×4608)',
    shortLabel: '9:16 12MP',
  },
  '1:1': {
    width: 3464,
    height: 3464,
    megapixels: 12.0,
    label: '1:1 Square 12MP (3464×3464)',
    shortLabel: '1:1 12MP',
  },
};

export interface RenderTile {
  index: number;
  col: number;
  row: number;
  /** Top-left pixel X in full output image (0-indexed) */
  x: number;
  /** Top-left pixel Y in full output image (0-indexed, top-down canvas coordinates) */
  y: number;
  width: number;
  height: number;
}

/**
 * Partitions a high-resolution still canvas into exact, non-overlapping tiles strictly
 * <= maxTileDim on each axis so 12MP offline renders never exceed WebGL MAX_TEXTURE_SIZE
 * or GPU VRAM budgets.
 */
export function computeRenderTiles(
  fullWidth: number,
  fullHeight: number,
  maxTileDim = 1536
): RenderTile[] {
  const safeMax = Math.max(256, Math.floor(maxTileDim));
  const cols = Math.max(1, Math.ceil(fullWidth / safeMax));
  const rows = Math.max(1, Math.ceil(fullHeight / safeMax));

  const tiles: RenderTile[] = [];
  let index = 0;

  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * fullHeight) / rows);
    const y1 = Math.floor(((row + 1) * fullHeight) / rows);
    const height = y1 - y0;

    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col * fullWidth) / cols);
      const x1 = Math.floor(((col + 1) * fullWidth) / cols);
      const width = x1 - x0;

      tiles.push({
        index: index++,
        col,
        row,
        x: x0,
        y: y0,
        width,
        height,
      });
    }
  }

  return tiles;
}

/**
 * 2x2 Rotated-Grid Super-Sampling (RGSS) sub-pixel offsets in pixel units.
 * Combined with 4x hardware MSAA per tile, yields crisp 16x effective anti-aliasing
 * on diagonal card bevels, lanyard weaves, and micro-typography.
 */
export const STILL_RGSS_OFFSETS: ReadonlyArray<{ dx: number; dy: number; weight: number }> = [
  { dx: -0.375, dy: -0.125, weight: 0.25 },
  { dx: 0.125, dy: -0.375, weight: 0.25 },
  { dx: 0.375, dy: 0.125, weight: 0.25 },
  { dx: -0.125, dy: 0.375, weight: 0.25 },
];

export interface TemporalShutterSample {
  /** Sub-frame offset relative to integer frame index, in [-shutter/2, +shutter/2] */
  offsetFrames: number;
  /** Normalized weight (all weights sum strictly to 1.0) */
  weight: number;
}

export function getTemporalSampleCount(quality: MotionBlurQuality): number {
  if (quality === 'off') return 1;
  if (quality === 'ultra') return 12;
  return 8; // 'cinema'
}

/**
 * Builds stratified temporal supersampling offsets & smooth Tukey-windowed cinema shutter weights.
 * Unlike a flat box filter (which can produce discrete multi-exposure ghosting during fast arcs),
 * the smooth raised-cosine shutter taper yields creamy, filmic motion trails centered on the frame.
 */
export function buildTemporalShutterSamples(
  quality: MotionBlurQuality,
  shutterAngleDeg: ShutterAngleDeg = 180
): TemporalShutterSample[] {
  const sampleCount = getTemporalSampleCount(quality);
  if (sampleCount <= 1) {
    return [{ offsetFrames: 0, weight: 1 }];
  }

  const shutterFraction = Math.max(0.05, Math.min(1.0, shutterAngleDeg / 360));
  const rawSamples: TemporalShutterSample[] = [];
  let weightSum = 0;

  for (let i = 0; i < sampleCount; i++) {
    // Stratified uniform placement in [-0.5, +0.5]
    const norm = (i + 0.5) / sampleCount - 0.5;
    const offsetFrames = norm * shutterFraction;

    // Smooth cinema shutter response: flat high-transmission center with cosine edge roll-off
    // u in [-1, 1] across shutter window
    const u = norm * 2;
    const weight = 0.35 + 0.65 * Math.pow(Math.cos((u * Math.PI) / 2), 1.35);

    rawSamples.push({ offsetFrames, weight });
    weightSum += weight;
  }

  return rawSamples.map((s) => ({
    offsetFrames: s.offsetFrames,
    weight: s.weight / weightSum,
  }));
}
