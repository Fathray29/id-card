import * as THREE from 'three';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import type { StudioRigBridge } from '../store/useStudioStore';
import type { AnimationPreset } from './physicsEngine';

export const RENDER_WIDTH = 1920;
export const RENDER_HEIGHT = 1080;
export const RENDER_FPS = 60;

export interface StillRenderOptions {
  format: 'png' | 'jpg';
  transparentBg: boolean;
}

export interface VideoRenderOptions {
  preset: AnimationPreset;
  durationSec: 4 | 6;
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
 * Allocates an offscreen 1920x1080 MSAA WebGLRenderTarget (4x MSAA on WebGL2 GPUs).
 */
function createOfflineRenderTarget(gl: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const isWebGL2 = gl.capabilities.isWebGL2;
  const maxSamples = isWebGL2 ? Math.min(4, gl.capabilities.maxSamples || 4) : 0;
  return new THREE.WebGLRenderTarget(RENDER_WIDTH, RENDER_HEIGHT, {
    samples: maxSamples,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
}

/**
 * Deterministic 1080p (1920x1080) MSAA offline still frame renderer.
 * Supports optional alpha-transparent PNG output without touching live viewport aspect.
 */
export async function render1080pStill(
  rigBridge: StudioRigBridge,
  options: StillRenderOptions
): Promise<string> {
  const refs = rigBridge.getSceneRefs();
  if (!refs) {
    throw new Error('3D viewport is not initialized yet.');
  }
  const { gl, scene, camera, invalidate } = refs;

  const rt = createOfflineRenderTarget(gl);
  const prevTarget = gl.getRenderTarget();
  const prevAspect = camera.aspect;
  const prevBackground = scene.background;
  const prevFog = scene.fog;
  const prevClearAlpha = gl.getClearAlpha();

  // Hide contact shadows temporarily if exporting transparent PNG cutout
  const hiddenForAlpha: THREE.Object3D[] = [];
  if (options.transparentBg && options.format === 'png') {
    scene.background = null;
    scene.fog = null;
    gl.setClearAlpha(0);
    scene.traverse((obj) => {
      // ContactShadows renders a ground plane at y = -5.5; keep only card + lanyard rig visible
      if (
        obj.type === 'Mesh' &&
        Math.abs(obj.position.y + 5.5) < 0.05 &&
        obj.visible
      ) {
        obj.visible = false;
        hiddenForAlpha.push(obj);
      }
    });
  }

  try {
    camera.aspect = RENDER_WIDTH / RENDER_HEIGHT;
    camera.updateProjectionMatrix();

    gl.setRenderTarget(rt);
    gl.clear(true, true, true);
    gl.render(scene, camera);

    const pixelBuffer = new Uint8Array(RENDER_WIDTH * RENDER_HEIGHT * 4);
    gl.readRenderTargetPixels(rt, 0, 0, RENDER_WIDTH, RENDER_HEIGHT, pixelBuffer);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = RENDER_WIDTH;
    outCanvas.height = RENDER_HEIGHT;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create 2D export canvas context.');

    const imgData = ctx.createImageData(RENDER_WIDTH, RENDER_HEIGHT);
    flipPixelsToImageData(pixelBuffer, imgData, RENDER_WIDTH, RENDER_HEIGHT);
    ctx.putImageData(imgData, 0, 0);

    const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = options.format === 'jpg' ? 0.95 : undefined;
    const filename = `id-card-render-1080p.${options.format}`;

    const blob = await new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode still image blob.'))),
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
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    gl.setRenderTarget(prevTarget);
    rt.dispose();
    invalidate();
  }
}

interface SelectedCodec {
  container: 'mp4' | 'webm';
  codec: string;
  muxerCodec: 'avc' | 'V_VP9' | 'V_VP8';
  mimeType: string;
  extension: 'mp4' | 'webm';
}

async function selectSupportedVideoCodec(): Promise<SelectedCodec> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error(
      'WebCodecs API (VideoEncoder) is not available in this browser. Try Chrome, Edge, or Safari 16.4+.'
    );
  }

  const candidates: SelectedCodec[] = [
    {
      container: 'mp4',
      codec: 'avc1.640028', // H.264 High Profile Level 4.0 (1080p60)
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
      codec: 'avc1.420028', // H.264 Baseline Level 4.0
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
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
        bitrate: 12_000_000,
        framerate: RENDER_FPS,
      });
      if (support.supported) {
        return cand;
      }
    } catch {
      // Try next codec candidate
    }
  }

  throw new Error('No compatible 1080p60 WebCodecs video encoder (H.264 or VP9/VP8) found.');
}

/**
 * Deterministic, frame-by-frame offline 1080p 60fps video renderer.
 * Steps physics & animation curves by exact dt = 1/60s, renders synchronously into
 * a 1920x1080 MSAA WebGLRenderTarget, encodes each frame via WebCodecs VideoEncoder,
 * muxes with mp4-muxer (or automatic webm-muxer VP9 fallback), and drops zero frames.
 */
export async function render1080p60Animation(
  rigBridge: StudioRigBridge,
  options: VideoRenderOptions
): Promise<string> {
  const refs = rigBridge.getSceneRefs();
  if (!refs) {
    throw new Error('3D viewport is not initialized yet.');
  }
  const { gl, scene, camera, invalidate } = refs;
  const totalFrames = options.durationSec * RENDER_FPS;

  options.onProgress(0, totalFrames, 'Initializing 1080p 60fps WebCodecs encoder...');
  const selected = await selectSupportedVideoCodec();

  const rt = createOfflineRenderTarget(gl);
  const prevTarget = gl.getRenderTarget();
  const prevAspect = camera.aspect;

  // Staging canvas for vertically flipped RGBA readback -> VideoFrame
  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const stagingCanvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(RENDER_WIDTH, RENDER_HEIGHT)
    : Object.assign(document.createElement('canvas'), {
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
      });

  const stagingCtx = stagingCanvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!stagingCtx) {
    rt.dispose();
    throw new Error('Unable to initialize 1920x1080 staging canvas.');
  }

  const pixelBuffer = new Uint8Array(RENDER_WIDTH * RENDER_HEIGHT * 4);
  const frameImageData = stagingCtx.createImageData(RENDER_WIDTH, RENDER_HEIGHT);

  let encoderError: Error | null = null;
  let mp4Muxer: Mp4Muxer<Mp4ArrayBufferTarget> | null = null;
  let webmMuxer: WebmMuxer<WebmArrayBufferTarget> | null = null;

  if (selected.container === 'mp4') {
    mp4Muxer = new Mp4Muxer({
      target: new Mp4ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
  } else {
    webmMuxer = new WebmMuxer({
      target: new WebmArrayBufferTarget(),
      video: {
        codec: selected.muxerCodec === 'V_VP9' ? 'V_VP9' : 'V_VP8',
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
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
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    bitrate: 12_000_000,
    framerate: RENDER_FPS,
    hardwareAcceleration: 'prefer-hardware',
  });

  const frameDurationUs = Math.round(1_000_000 / RENDER_FPS);

  try {
    camera.aspect = RENDER_WIDTH / RENDER_HEIGHT;
    camera.updateProjectionMatrix();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (options.signal.aborted) {
        throw new DOMException('Render cancelled by user', 'AbortError');
      }
      if (encoderError) {
        throw encoderError;
      }

      // Deterministic simulation step at exact timestamp t = frame / 60
      rigBridge.stepOfflinePreset(options.preset, frame, totalFrames, RENDER_FPS);
      scene.updateMatrixWorld(true);

      // Synchronous render into 1920x1080 MSAA target
      gl.setRenderTarget(rt);
      gl.clear(true, true, true);
      gl.render(scene, camera);

      // Readback + Y-flip onto staging canvas
      gl.readRenderTargetPixels(rt, 0, 0, RENDER_WIDTH, RENDER_HEIGHT, pixelBuffer);
      flipPixelsToImageData(pixelBuffer, frameImageData, RENDER_WIDTH, RENDER_HEIGHT);
      stagingCtx.putImageData(frameImageData, 0, 0);

      // Backpressure guard so encoder queue never bloats RAM
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

      encoder.encode(videoFrame, { keyFrame: frame % RENDER_FPS === 0 });
      videoFrame.close(); // Immediately free GPU/RAM backing

      // Yield to main thread every 4 frames for responsive progress UI & cancel button
      if (frame % 4 === 0 || frame === totalFrames - 1) {
        const displayFrame = frame + 1;
        const pct = Math.round((displayFrame / totalFrames) * 100);
        options.onProgress(
          displayFrame,
          totalFrames,
          `Rendering Frame ${displayFrame} / ${totalFrames} — ${pct}%`
        );
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    options.onProgress(totalFrames, totalFrames, 'Flushing encoder & finalizing container...');
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

    const filename = `id-card-showcase-1080p60.${selected.extension}`;
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
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    gl.setRenderTarget(prevTarget);
    rt.dispose();
    rigBridge.resetSimulation();
    invalidate();
  }
}
