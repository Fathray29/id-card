import * as THREE from 'three';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import { useStudioStore, type StudioRigBridge } from '../store/useStudioStore';
import {
  EXPORT_RESOLUTIONS,
  type AnimationPreset,
  type ExportAspectRatio,
  type VideoDurationSec,
} from './physicsEngine';
import {
  STILL_12MP_RESOLUTIONS,
  STILL_RGSS_OFFSETS,
  buildTemporalShutterSamples,
  computeRenderTiles,
  type MotionBlurQuality,
  type ShutterAngleDeg,
} from './renderMath';

export const RENDER_FPS = 24;

export interface StillRenderOptions {
  format: 'png' | 'jpg';
  transparentBg: boolean;
  aspectRatio?: ExportAspectRatio;
  msaaSamples?: number;
  signal?: AbortSignal;
  onProgress?: (step: number, totalSteps: number, stageLabel: string) => void;
}

export interface VideoRenderOptions {
  preset: AnimationPreset;
  durationSec: VideoDurationSec;
  aspectRatio?: ExportAspectRatio;
  msaaSamples?: number;
  motionBlur?: MotionBlurQuality;
  shutterAngleDeg?: ShutterAngleDeg;
  signal: AbortSignal;
  onProgress: (frame: number, totalFrames: number, stageLabel: string) => void;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Vertically flips RGBA WebGL readback pixels (bottom-left origin) into
 * top-left origin ImageData on a 2D canvas context.
 */
function flipPixelsToImageData(
  pixels: Uint8Array,
  imageData: ImageData,
  width: number,
  height: number
): void {
  const dst = imageData.data;
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcOffset = (height - 1 - y) * rowBytes;
    const dstOffset = y * rowBytes;
    dst.set(pixels.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
  }
}

/**
 * Checks if the active WebGL context can safely render into RGBA16F (HalfFloat) targets
 * for artifact-free linear-space temporal & spatial supersampling accumulation.
 */
function supportsHalfFloatRenderTarget(gl: THREE.WebGLRenderer): boolean {
  if (!gl.capabilities.isWebGL2) return false;
  return (
    gl.extensions.has('EXT_color_buffer_float') ||
    gl.extensions.has('EXT_color_buffer_half_float')
  );
}

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * True HDR Linear-Light weighted running accumulator shader:
 *  - Three.js renders raw linear radiance directly into offscreen WebGLRenderTargets
 *    (prior to tone mapping & sRGB encoding), so we accumulate true linear HDR values
 *    without double-gamma darkening or clipped highlights!
 *  - Preserves premultiplied alpha when exporting transparent cutouts (zero dark fringing).
 */
const ACCUM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrev;
  uniform sampler2D uSample;
  uniform float uWeight;
  uniform float uWeightSum;
  uniform float uPreserveAlpha;

  varying vec2 vUv;

  void main() {
    vec4 s = texture2D(uSample, vUv);
    vec3 linRgb = max(s.rgb, vec3(0.0));
    float a = uPreserveAlpha > 0.5 ? clamp(s.a, 0.0, 1.0) : 1.0;

    // Accumulate premultiplied HDR linear RGB when preserving alpha so anti-aliased edges never darken
    vec4 curr = vec4(uPreserveAlpha > 0.5 ? linRgb * a : linRgb, a);

    float blendFactor = clamp(uWeight / max(1e-6, uWeightSum), 0.0, 1.0);
    if (blendFactor >= 0.9999) {
      gl_FragColor = curr;
      return;
    }

    vec4 prev = texture2D(uPrev, vUv);
    gl_FragColor = mix(prev, curr, blendFactor);
  }
`;

/**
 * Final HDR Linear -> ACES Filmic Tone Mapping -> IEC 61966-2-1 sRGB Resolve Shader
 * with Triangular PDF (TPDF) sub-LSB dithering:
 *  - Matches live StudioScene ACESFilmicToneMapping & exposure pixel-for-pixel
 *  - Eliminates 8-bit concentric banding across dark Obsidian/Slate backdrops
 *  - Cleanly un-premultiplies alpha for transparent 12MP PNG cutouts
 */
const RESOLVE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uAccum;
  uniform float uPreserveAlpha;
  uniform float uExposure;
  uniform vec2 uPixelOffset;
  uniform float uSeed;

  varying vec2 vUv;

  // Exact Three.js ACESFilmicToneMapping (Stephen Hill RRT+ODT fit)
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 acesFilmicToneMapping(vec3 color, float exposure) {
    const mat3 ACESInputMat = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 ACESOutputMat = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    color *= exposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }

  vec3 linearToSrgb(vec3 c) {
    vec3 cl = clamp(c, 0.0, 1.0);
    vec3 low = cl * 12.92;
    vec3 high = 1.055 * pow(cl, vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), cl));
  }

  // Interleaved Gradient Noise (Jimenez 2014) -> Triangular PDF in [-0.5, +0.5] LSB
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec4 acc = texture2D(uAccum, vUv);
    float a = uPreserveAlpha > 0.5 ? clamp(acc.a, 0.0, 1.0) : 1.0;
    vec3 linRgb = uPreserveAlpha > 0.5
      ? (a > 1e-4 ? acc.rgb / a : vec3(0.0))
      : acc.rgb;

    vec3 toneMapped = acesFilmicToneMapping(max(linRgb, vec3(0.0)), uExposure);
    vec3 srgb = linearToSrgb(toneMapped);

    // Sub-LSB TPDF dither kills 8-bit dark studio banding without adding visible grain
    vec2 coord = gl_FragCoord.xy + uPixelOffset + vec2(uSeed * 17.0, uSeed * 31.0);
    float r1 = ign(coord);
    float r2 = ign(coord + vec2(5.588238, 11.176476));
    float tpdf = (r1 + r2 - 1.0) / 255.0;

    srgb = clamp(srgb + vec3(tpdf) * a, 0.0, 1.0);
    gl_FragColor = vec4(srgb, a);
  }
`;

/**
 * GPU-accelerated HDR Linear-Space Supersampling Accumulation Pipeline.
 * Powers both:
 *   1. Temporal Supersampling Motion Blur (offline 24fps cinema videos)
 *   2. 4x RGSS Spatial Supersampling per tile (12MP artifact-free stills)
 * Performs ONLY ONE `readRenderTargetPixels` readback per completed frame/tile.
 */
class LinearAccumulationPipeline {
  private readonly gl: THREE.WebGLRenderer;
  readonly width: number;
  readonly height: number;
  private readonly rtSample: THREE.WebGLRenderTarget;
  private readonly rtAccumA: THREE.WebGLRenderTarget;
  private readonly rtAccumB: THREE.WebGLRenderTarget;
  private readonly rtResolve: THREE.WebGLRenderTarget;
  private readonly quadScene: THREE.Scene;
  private readonly quadCamera: THREE.OrthographicCamera;
  private readonly quadGeo: THREE.PlaneGeometry;
  private readonly quadMesh: THREE.Mesh;
  private readonly accumMat: THREE.ShaderMaterial;
  private readonly resolveMat: THREE.ShaderMaterial;
  private readIdx = 0;
  private weightSum = 0;

  constructor(
    gl: THREE.WebGLRenderer,
    width: number,
    height: number,
    requestedMsaa = 4
  ) {
    this.gl = gl;
    this.width = width;
    this.height = height;

    const isWebGL2 = gl.capabilities.isWebGL2;
    const clampedMsaa = Math.max(0, Math.min(4, Math.round(requestedMsaa)));
    const samples = isWebGL2
      ? Math.min(clampedMsaa, gl.capabilities.maxSamples || clampedMsaa)
      : 0;

    const hdrType = supportsHalfFloatRenderTarget(gl)
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;

    // HDR linear MSAA target preserves >1.0 metallic specular peaks during motion blur & SSAA
    this.rtSample = new THREE.WebGLRenderTarget(width, height, {
      samples,
      type: hdrType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    const accumParams: THREE.RenderTargetOptions = {
      samples: 0,
      type: hdrType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.rtAccumA = new THREE.WebGLRenderTarget(width, height, accumParams);
    this.rtAccumB = new THREE.WebGLRenderTarget(width, height, accumParams);

    this.rtResolve = new THREE.WebGLRenderTarget(width, height, {
      samples: 0,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.accumMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: ACCUM_FRAGMENT_SHADER,
      uniforms: {
        uPrev: { value: this.rtAccumA.texture },
        uSample: { value: this.rtSample.texture },
        uWeight: { value: 1.0 },
        uWeightSum: { value: 1.0 },
        uPreserveAlpha: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.resolveMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: RESOLVE_FRAGMENT_SHADER,
      uniforms: {
        uAccum: { value: this.rtAccumA.texture },
        uPreserveAlpha: { value: 0.0 },
        uExposure: { value: gl.toneMappingExposure || 1.08 },
        uPixelOffset: { value: new THREE.Vector2(0, 0) },
        uSeed: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(this.quadGeo, this.accumMat);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  beginFrame(): void {
    this.weightSum = 0;
    this.readIdx = 0;
  }

  /**
   * Renders the 3D scene in HDR linear space into the MSAA sample target and folds it into
   * the linear-light accumulation buffer with weight `weight`.
   */
  accumulateSample(
    scene: THREE.Scene,
    camera: THREE.Camera,
    weight: number,
    preserveAlpha: boolean
  ): void {
    const gl = this.gl;

    // 1. Rasterize scene in HDR linear radiance into MSAA target
    gl.setRenderTarget(this.rtSample);
    gl.clear(true, true, true);
    gl.render(scene, camera);

    // 2. Fold linear HDR sample into ping-pong accumulation buffer
    const prevClearAlpha = gl.getClearAlpha();
    const readTarget = this.readIdx === 0 ? this.rtAccumA : this.rtAccumB;
    const writeTarget = this.readIdx === 0 ? this.rtAccumB : this.rtAccumA;

    this.weightSum += weight;
    this.accumMat.uniforms.uPrev.value = readTarget.texture;
    this.accumMat.uniforms.uSample.value = this.rtSample.texture;
    this.accumMat.uniforms.uWeight.value = weight;
    this.accumMat.uniforms.uWeightSum.value = this.weightSum;
    this.accumMat.uniforms.uPreserveAlpha.value = preserveAlpha ? 1.0 : 0.0;

    this.quadMesh.material = this.accumMat;
    gl.setRenderTarget(writeTarget);
    gl.setClearAlpha(0);
    gl.render(this.quadScene, this.quadCamera);

    gl.setClearAlpha(prevClearAlpha);
    this.readIdx = 1 - this.readIdx;
  }

  /**
   * Applies ACES Filmic tone mapping + Linear->sRGB + TPDF dither and performs a single
   * GPU->CPU pixel readback into `outPixels`.
   */
  resolveToPixels(
    outPixels: Uint8Array,
    preserveAlpha: boolean,
    pixelOffsetX = 0,
    pixelOffsetY = 0,
    ditherSeed = 0
  ): void {
    const gl = this.gl;
    const finalAccum = this.readIdx === 0 ? this.rtAccumA : this.rtAccumB;
    const prevClearAlpha = gl.getClearAlpha();

    this.resolveMat.uniforms.uAccum.value = finalAccum.texture;
    this.resolveMat.uniforms.uPreserveAlpha.value = preserveAlpha ? 1.0 : 0.0;
    this.resolveMat.uniforms.uExposure.value = gl.toneMappingExposure || 1.08;
    (this.resolveMat.uniforms.uPixelOffset.value as THREE.Vector2).set(
      pixelOffsetX,
      pixelOffsetY
    );
    this.resolveMat.uniforms.uSeed.value = ditherSeed;

    this.quadMesh.material = this.resolveMat;
    gl.setRenderTarget(this.rtResolve);
    gl.setClearAlpha(0);
    gl.render(this.quadScene, this.quadCamera);

    gl.readRenderTargetPixels(this.rtResolve, 0, 0, this.width, this.height, outPixels);
    gl.setClearAlpha(prevClearAlpha);
  }

  dispose(): void {
    this.rtSample.dispose();
    this.rtAccumA.dispose();
    this.rtAccumB.dispose();
    this.rtResolve.dispose();
    this.quadGeo.dispose();
    this.accumMat.dispose();
    this.resolveMat.dispose();
  }
}

/**
 * Deterministic 12-Megapixel (4608×2592 / 2592×4608 / 3464×3464) Artifact-Free Offline Still Renderer.
 * Uses tiled sub-frustum rendering (`camera.setViewOffset`) combined with 4x RGSS sub-pixel
 * supersampling + 4x hardware MSAA (effective 16x AA) + linear-space accumulation + TPDF dithering
 * and clean shadow-plane removal on transparent PNGs.
 */
export async function render12mpStill(
  rigBridge: StudioRigBridge,
  options: StillRenderOptions
): Promise<string> {
  const refs = rigBridge.getSceneRefs();
  if (!refs) {
    throw new Error('3D viewport is not initialized yet.');
  }
  const { gl, scene, camera, invalidate } = refs;
  const ratioKey = options.aspectRatio ?? '16:9';
  const spec = STILL_12MP_RESOLUTIONS[ratioKey];
  const { width: fullW, height: fullH } = spec;
  const preserveAlpha = options.transparentBg && options.format === 'png';

  // Choose tile size safely below GPU maxTextureSize so 12MP never triggers OOM or truncation
  const maxTex = gl.capabilities.maxTextureSize || 4096;
  const maxTileDim = Math.min(1536, Math.max(512, Math.floor(maxTex / 2)));
  const tiles = computeRenderTiles(fullW, fullH, maxTileDim);
  const totalTiles = tiles.length;

  const prevTarget = gl.getRenderTarget();
  const prevAspect = camera.aspect;
  const prevBackground = scene.background;
  const prevFog = scene.fog;
  const prevClearAlpha = gl.getClearAlpha();

  // Hide ContactShadows cleanly (for both bare card y=-5.5 and case y=-6.5) on transparent PNGs
  const hiddenForAlpha: THREE.Object3D[] = [];
  if (preserveAlpha) {
    scene.background = null;
    scene.fog = null;
    gl.setClearAlpha(0);
    scene.traverse((obj) => {
      if (obj.name === 'studio-contact-shadows' && obj.visible) {
        obj.visible = false;
        hiddenForAlpha.push(obj);
      }
    });
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = fullW;
  outCanvas.height = fullH;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 12MP 2D export canvas context.');
  }

  let pipeline: LinearAccumulationPipeline | null = null;
  let lastTileW = 0;
  let lastTileH = 0;
  let tilePixels = new Uint8Array(0);
  let tileImageData: ImageData | null = null;

  try {
    camera.aspect = fullW / fullH;
    scene.updateMatrixWorld(true);

    for (let i = 0; i < totalTiles; i++) {
      if (options.signal?.aborted) {
        throw new DOMException('12MP render cancelled by user', 'AbortError');
      }

      const tile = tiles[i];
      options.onProgress?.(
        i,
        totalTiles,
        `Rendering 12MP Tile ${i + 1} / ${totalTiles} (16× SSAA)...`
      );

      // Reuse GPU accumulation pipeline across equal-sized tiles to minimize allocations
      if (!pipeline || tile.width !== lastTileW || tile.height !== lastTileH) {
        pipeline?.dispose();
        pipeline = new LinearAccumulationPipeline(
          gl,
          tile.width,
          tile.height,
          options.msaaSamples ?? 4
        );
        lastTileW = tile.width;
        lastTileH = tile.height;
        tilePixels = new Uint8Array(tile.width * tile.height * 4);
        tileImageData = ctx.createImageData(tile.width, tile.height);
      }

      pipeline.beginFrame();

      // 4x Rotated-Grid Sub-Pixel Super-Sampling (RGSS) on top of 4x MSAA -> 16x effective AA
      for (const sample of STILL_RGSS_OFFSETS) {
        camera.setViewOffset(
          fullW,
          fullH,
          tile.x + sample.dx,
          tile.y + sample.dy,
          tile.width,
          tile.height
        );
        camera.updateProjectionMatrix();
        pipeline.accumulateSample(scene, camera, sample.weight, preserveAlpha);
      }

      pipeline.resolveToPixels(tilePixels, preserveAlpha, tile.x, tile.y, 0.37);
      flipPixelsToImageData(tilePixels, tileImageData!, tile.width, tile.height);
      ctx.putImageData(tileImageData!, tile.x, tile.y);

      // Yield briefly so progress bar & cancel button remain responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    options.onProgress?.(totalTiles, totalTiles, `Encoding 12MP ${options.format.toUpperCase()}...`);

    const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = options.format === 'jpg' ? 0.98 : undefined;
    const activePlacement = useStudioStore.getState().placementScene;
    const placementSlug = activePlacement === 'studio' ? '' : `-${activePlacement}`;
    const filename = `id-card${placementSlug}-12mp-${fullW}x${fullH}.${options.format}`;

    const blob = await new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode 12MP still image blob.'))),
        mime,
        quality
      );
    });

    triggerDownload(blob, filename);
    return filename;
  } finally {
    hiddenForAlpha.forEach((obj) => {
      obj.visible = true;
    });
    scene.background = prevBackground;
    scene.fog = prevFog;
    gl.setClearAlpha(prevClearAlpha);
    camera.clearViewOffset();
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    gl.setRenderTarget(prevTarget);
    pipeline?.dispose();
    invalidate();
  }
}

/** Backwards-compatible alias pointing to the upgraded 12MP renderer */
export const render1080pStill = render12mpStill;

interface SelectedCodec {
  container: 'mp4' | 'webm';
  codec: string;
  muxerCodec: 'avc' | 'V_VP9' | 'V_VP8';
  mimeType: string;
  extension: 'mp4' | 'webm';
}

const STUDIO_VIDEO_BITRATE = 24_000_000; // 24 Mbps high-bitrate master for zero macroblocking

async function selectSupportedVideoCodec(width: number, height: number): Promise<SelectedCodec> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error(
      'WebCodecs API (VideoEncoder) is not available in this browser. Try Chrome, Edge, or Safari 16.4+.'
    );
  }

  const candidates: SelectedCodec[] = [
    {
      container: 'mp4',
      codec: 'avc1.640028', // H.264 High Profile Level 4.0 (1080p24 cinema)
      muxerCodec: 'avc',
      mimeType: 'video/mp4',
      extension: 'mp4',
    },
    {
      container: 'mp4',
      codec: 'avc1.64002a', // H.264 High Profile Level 4.2 fallback
      muxerCodec: 'avc',
      mimeType: 'video/mp4',
      extension: 'mp4',
    },
    {
      container: 'mp4',
      codec: 'avc1.4d002a', // H.264 Main Profile Level 4.2
      muxerCodec: 'avc',
      mimeType: 'video/mp4',
      extension: 'mp4',
    },
    {
      container: 'mp4',
      codec: 'avc1.42002a', // H.264 Baseline Level 4.2
      muxerCodec: 'avc',
      mimeType: 'video/mp4',
      extension: 'mp4',
    },
    {
      container: 'webm',
      codec: 'vp09.00.41.08', // VP9 Profile 0 Level 4.1 fallback
      muxerCodec: 'V_VP9',
      mimeType: 'video/webm',
      extension: 'webm',
    },
    {
      container: 'webm',
      codec: 'vp8',
      muxerCodec: 'V_VP8',
      mimeType: 'video/webm',
      extension: 'webm',
    },
  ];

  for (const cand of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: cand.codec,
        width,
        height,
        bitrate: STUDIO_VIDEO_BITRATE,
        framerate: RENDER_FPS,
      });
      if (support.supported) {
        return cand;
      }
    } catch {
      // Try next codec candidate
    }
  }

  throw new Error('No compatible 1080p24 WebCodecs video encoder (H.264 or VP9/VP8) found.');
}

/**
 * Deterministic, frame-by-frame offline 1080p 24fps cinema video renderer with
 * GPU Temporal Supersampling Motion Blur (linear-light shutter accumulation + TPDF dithering)
 * and 24 Mbps H.264 / VP9 encoding for seamless, filmic playback from start to finish.
 */
export async function render1080p24Animation(
  rigBridge: StudioRigBridge,
  options: VideoRenderOptions
): Promise<string> {
  const refs = rigBridge.getSceneRefs();
  if (!refs) {
    throw new Error('3D viewport is not initialized yet.');
  }
  const { gl, scene, camera, invalidate } = refs;
  const ratioKey = options.aspectRatio ?? '16:9';
  const { width, height } = EXPORT_RESOLUTIONS[ratioKey];
  const aspect = width / height;
  const totalFrames = options.durationSec * RENDER_FPS;

  const motionBlur = options.motionBlur ?? 'cinema';
  const shutterAngleDeg = options.shutterAngleDeg ?? 180;
  const shutterSamples = buildTemporalShutterSamples(motionBlur, shutterAngleDeg);
  const subSampleCount = shutterSamples.length;

  options.onProgress(
    0,
    totalFrames,
    `Initializing ${width}×${height} 24fps (${subSampleCount}× temporal blur, 24 Mbps)...`
  );
  const selected = await selectSupportedVideoCodec(width, height);

  const pipeline = new LinearAccumulationPipeline(gl, width, height, options.msaaSamples ?? 4);
  const prevTarget = gl.getRenderTarget();
  const prevAspect = camera.aspect;
  const prevFov = camera.fov;
  const prevPos = camera.position.clone();
  const prevQuat = camera.quaternion.clone();

  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const stagingCanvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });

  const stagingCtx = stagingCanvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!stagingCtx) {
    pipeline.dispose();
    throw new Error('Unable to initialize offline staging canvas.');
  }

  const pixelBuffer = new Uint8Array(width * height * 4);
  const frameImageData = stagingCtx.createImageData(width, height);

  let encoderError: Error | null = null;
  let mp4Muxer: Mp4Muxer<Mp4ArrayBufferTarget> | null = null;
  let webmMuxer: WebmMuxer<WebmArrayBufferTarget> | null = null;

  if (selected.container === 'mp4') {
    mp4Muxer = new Mp4Muxer({
      target: new Mp4ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
  } else {
    webmMuxer = new WebmMuxer({
      target: new WebmArrayBufferTarget(),
      video: {
        codec: selected.muxerCodec === 'V_VP9' ? 'V_VP9' : 'V_VP8',
        width,
        height,
        frameRate: RENDER_FPS,
      },
    });
  }

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (mp4Muxer) {
        mp4Muxer.addVideoChunk(chunk, meta);
      } else if (webmMuxer) {
        webmMuxer.addVideoChunk(chunk, meta);
      }
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec: selected.codec,
    width,
    height,
    bitrate: STUDIO_VIDEO_BITRATE,
    bitrateMode: 'variable',
    latencyMode: 'quality',
    framerate: RENDER_FPS,
    hardwareAcceleration: 'prefer-hardware',
  });

  const frameDurationUs = Math.round(1_000_000 / RENDER_FPS);

  try {
    camera.aspect = aspect;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (options.signal.aborted) {
        throw new DOMException('Render cancelled by user', 'AbortError');
      }
      if (encoderError) {
        throw encoderError;
      }

      pipeline.beginFrame();

      // Temporal Supersampling across cinema shutter window [-shutter/2, +shutter/2]
      for (let s = 0; s < subSampleCount; s++) {
        const sample = shutterSamples[s];
        const subFrame = frame + sample.offsetFrames;

        rigBridge.stepOfflinePreset(options.preset, subFrame, totalFrames, RENDER_FPS, aspect);
        scene.updateMatrixWorld(true);
        pipeline.accumulateSample(scene, camera, sample.weight, false);
      }

      // Single resolved readback with Linear->sRGB + TPDF dither (zero dark backdrop banding)
      pipeline.resolveToPixels(pixelBuffer, false, 0, 0, frame % 64);
      flipPixelsToImageData(pixelBuffer, frameImageData, width, height);
      stagingCtx.putImageData(frameImageData, 0, 0);

      while (encoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 4));
        if (options.signal.aborted) {
          throw new DOMException('Render cancelled by user', 'AbortError');
        }
      }

      const timestampUs = Math.round(frame * (1_000_000 / RENDER_FPS));
      const videoFrame = new VideoFrame(stagingCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });

      // 1-second IDR keyframe interval at 24fps keeps fast motion-blurred arcs razor-sharp
      encoder.encode(videoFrame, { keyFrame: frame % RENDER_FPS === 0 });
      videoFrame.close();

      if (frame % 2 === 0 || frame === totalFrames - 1) {
        const displayFrame = frame + 1;
        const pct = Math.round((displayFrame / totalFrames) * 100);
        const blurTag = subSampleCount > 1 ? ` · ${subSampleCount}× Blur` : '';
        options.onProgress(
          displayFrame,
          totalFrames,
          `Frame ${displayFrame} / ${totalFrames}${blurTag} — ${pct}%`
        );
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    options.onProgress(totalFrames, totalFrames, 'Flushing 24 Mbps encoder & finalizing container...');
    await encoder.flush();

    if (encoderError) {
      throw encoderError;
    }

    let finalBuffer: ArrayBuffer;
    if (mp4Muxer) {
      mp4Muxer.finalize();
      finalBuffer = mp4Muxer.target.buffer;
    } else {
      webmMuxer!.finalize();
      finalBuffer = webmMuxer!.target.buffer;
    }

    const activePlacement = useStudioStore.getState().placementScene;
    const placementSlug = activePlacement === 'studio' ? 'showcase' : activePlacement;
    const suffix =
      ratioKey === '16:9'
        ? '1080p24'
        : ratioKey === '9:16'
          ? 'reel-1080x1920-24fps'
          : 'square-1080-24fps';
    const filename = `id-card-${placementSlug}-${suffix}.${selected.extension}`;
    const blob = new Blob([finalBuffer], { type: selected.mimeType });
    triggerDownload(blob, filename);
    return filename;
  } finally {
    if (encoder.state !== 'closed') {
      try {
        encoder.close();
      } catch {
        // Ignore close errors on aborted encoder
      }
    }
    camera.position.copy(prevPos);
    camera.quaternion.copy(prevQuat);
    camera.fov = prevFov;
    camera.aspect = prevAspect;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    gl.setRenderTarget(prevTarget);
    pipeline.dispose();
    rigBridge.resetSimulation();
    invalidate();
  }
}

/** Backwards-compatible alias pointing to the 24fps cinema video renderer */
export const render1080p60Animation = render1080p24Animation;
