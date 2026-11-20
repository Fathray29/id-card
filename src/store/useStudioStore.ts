import { create } from 'zustand';
import type * as THREE from 'three';
import type {
  AnimationPreset,
  ExportAspectRatio,
  VideoDurationSec,
} from '../utils/physicsEngine';
import {
  createInitialPerformanceTier,
  detectMobileDevice,
  type PerformanceTier,
} from '../utils/performanceMonitor';

export type LayerId = 'front' | 'back' | 'lanyard';
export type FitMode = 'cover' | 'contain' | 'stretch';
export type CardFinish = 'glossy' | 'matte';
export type EdgeMaterialPreset = 'white' | 'black' | 'gold' | 'silver';
export type HardwareFinish = 'brushed-steel' | 'matte-black' | 'champagne-gold';
export type CameraPresetId = 'full' | 'front' | 'back' | 'macro';
export type SidebarTabId = 'front' | 'back' | 'lanyard' | 'finish';
export type SampleTemplateId = 'tech-vip' | 'corporate-sec' | 'minimal-staff';
export type ExportMode = 'still' | 'video';

export interface LayerTransform {
  fitMode: FitMode;
  scale: number; // 0.5 to 2.5
  offsetX: number; // -1 to 1 (fraction of canvas width)
  offsetY: number; // -1 to 1 (fraction of canvas height)
  rotation: 0 | 90 | 180 | 270;
  backgroundColor: string;
  /** Data URL or object URL for user uploaded image; null uses procedural template */
  uploadedImageUrl: string | null;
  uploadedFileName: string | null;
  /** Repeats along the 80cm lanyard length when lanyard layer is active */
  lanyardRepeat: number;
  /** Revision counter to trigger GPU CanvasTexture re-compilation only on edits */
  revision: number;
}

export interface RenderProgressState {
  isRendering: boolean;
  mode: ExportMode;
  currentFrame: number;
  totalFrames: number;
  percent: number;
  stageLabel: string;
  error: string | null;
  lastCompletedFile: string | null;
}

export interface StudioRigBridge {
  stepSimulation: (dt: number, deterministicTime?: number) => void;
  stepOfflinePreset: (
    preset: AnimationPreset,
    frameIndex: number,
    totalFrames: number,
    fps?: number,
    aspect?: number
  ) => void;
  resetSimulation: () => void;
  triggerFlipImpulse: (targetY: number) => void;
  getSceneRefs: () => {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    invalidate: () => void;
  } | null;
}

interface StudioState {
  // Adaptive mobile performance tier (managed silently by StudioScene PerformanceMonitor)
  performanceTier: PerformanceTier;
  setPerformanceTier: (tier: PerformanceTier) => void;

  // Active UI tab & mobile bottom sheet state
  activeTab: SidebarTabId;
  setActiveTab: (tab: SidebarTabId) => void;
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;

  // Built-in procedural template
  activeTemplate: SampleTemplateId;
  applyTemplate: (template: SampleTemplateId) => void;

  // Layer transforms (Front, Back, Lanyard)
  layers: Record<LayerId, LayerTransform>;
  updateLayer: (layerId: LayerId, patch: Partial<LayerTransform>) => void;
  setLayerUpload: (layerId: LayerId, imageUrl: string | null, fileName: string | null) => void;
  resetLayerTransform: (layerId: LayerId) => void;

  // Materials & FX
  cardFinish: CardFinish;
  setCardFinish: (finish: CardFinish) => void;
  edgePreset: EdgeMaterialPreset;
  setEdgePreset: (edge: EdgeMaterialPreset) => void;
  hardwareFinish: HardwareFinish;
  setHardwareFinish: (finish: HardwareFinish) => void;
  hologramEnabled: boolean;
  setHologramEnabled: (enabled: boolean) => void;
  hologramIntensity: number;
  setHologramIntensity: (intensity: number) => void;
  studioBackdrop: 'obsidian' | 'slate' | 'studio-light';
  setStudioBackdrop: (backdrop: 'obsidian' | 'slate' | 'studio-light') => void;

  // Viewport & Rig controls
  showLanyard: boolean;
  toggleLanyard: () => void;
  isFlipped: boolean;
  toggleFlip: () => void;
  setFlipped: (flipped: boolean) => void;
  autoSpin: boolean;
  toggleAutoSpin: () => void;
  previewReel: boolean;
  togglePreviewReel: () => void;
  setPreviewReel: (active: boolean) => void;
  cameraPreset: CameraPresetId;
  cameraRequestNonce: number;
  setCameraPreset: (preset: CameraPresetId) => void;

  // Export Modal & Render State
  exportModalOpen: boolean;
  exportModalMode: ExportMode;
  openExportModal: (mode: ExportMode) => void;
  closeExportModal: () => void;
  exportAspect: ExportAspectRatio;
  setExportAspect: (aspect: ExportAspectRatio) => void;
  stillFormat: 'png' | 'jpg';
  setStillFormat: (fmt: 'png' | 'jpg') => void;
  stillTransparentBg: boolean;
  setStillTransparentBg: (transparent: boolean) => void;
  videoPreset: AnimationPreset;
  setVideoPreset: (preset: AnimationPreset) => void;
  videoDurationSec: VideoDurationSec;
  setVideoDurationSec: (sec: VideoDurationSec) => void;

  renderProgress: RenderProgressState;
  setRenderProgress: (patch: Partial<RenderProgressState>) => void;

  // Imperative bridge registered by StudioScene / AssemblyRig for offline rendering
  rigBridge: StudioRigBridge | null;
  registerRigBridge: (bridge: StudioRigBridge | null) => void;
}

const createDefaultLayer = (bgColor: string, lanyardRepeat = 1): LayerTransform => ({
  fitMode: 'cover',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  backgroundColor: bgColor,
  uploadedImageUrl: null,
  uploadedFileName: null,
  lanyardRepeat,
  revision: 1,
});

const TEMPLATE_DEFAULTS: Record<
  SampleTemplateId,
  {
    frontBg: string;
    backBg: string;
    lanyardBg: string;
    edge: EdgeMaterialPreset;
    finish: CardFinish;
    hardware: HardwareFinish;
    hologram: boolean;
  }
> = {
  'tech-vip': {
    frontBg: '#0c1122',
    backBg: '#0c1122',
    lanyardBg: '#1d2b8a',
    edge: 'black',
    finish: 'glossy',
    hardware: 'brushed-steel',
    hologram: true,
  },
  'corporate-sec': {
    frontBg: '#f8fafc',
    backBg: '#f1f5f9',
    lanyardBg: '#0369a1',
    edge: 'white',
    finish: 'glossy',
    hardware: 'brushed-steel',
    hologram: true,
  },
  'minimal-staff': {
    frontBg: '#141416',
    backBg: '#141416',
    lanyardBg: '#111115',
    edge: 'gold',
    finish: 'matte',
    hardware: 'champagne-gold',
    hologram: false,
  },
};

export const useStudioStore = create<StudioState>((set, get) => ({
  performanceTier: createInitialPerformanceTier(detectMobileDevice()),
  setPerformanceTier: (performanceTier) => set({ performanceTier }),

  activeTab: 'front',
  setActiveTab: (tab) => set({ activeTab: tab }),
  mobileDrawerOpen: false,
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),

  activeTemplate: 'tech-vip',
  applyTemplate: (template) => {
    const cfg = TEMPLATE_DEFAULTS[template];
    const current = get().layers;
    set({
      activeTemplate: template,
      edgePreset: cfg.edge,
      cardFinish: cfg.finish,
      hardwareFinish: cfg.hardware,
      hologramEnabled: cfg.hologram,
      layers: {
        front: {
          ...current.front,
          backgroundColor: cfg.frontBg,
          uploadedImageUrl: null,
          uploadedFileName: null,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          revision: current.front.revision + 1,
        },
        back: {
          ...current.back,
          backgroundColor: cfg.backBg,
          uploadedImageUrl: null,
          uploadedFileName: null,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          revision: current.back.revision + 1,
        },
        lanyard: {
          ...current.lanyard,
          backgroundColor: cfg.lanyardBg,
          uploadedImageUrl: null,
          uploadedFileName: null,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          lanyardRepeat: 1,
          revision: current.lanyard.revision + 1,
        },
      },
    });
  },

  layers: {
    front: createDefaultLayer('#0c1122', 1),
    back: createDefaultLayer('#0c1122', 1),
    lanyard: createDefaultLayer('#1d2b8a', 1),
  },

  updateLayer: (layerId, patch) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layerId]: {
          ...state.layers[layerId],
          ...patch,
          revision: state.layers[layerId].revision + 1,
        },
      },
    })),

  setLayerUpload: (layerId, imageUrl, fileName) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layerId]: {
          ...state.layers[layerId],
          uploadedImageUrl: imageUrl,
          uploadedFileName: fileName,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          revision: state.layers[layerId].revision + 1,
        },
      },
    })),

  resetLayerTransform: (layerId) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layerId]: {
          ...state.layers[layerId],
          fitMode: 'cover',
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          lanyardRepeat: 1,
          revision: state.layers[layerId].revision + 1,
        },
      },
    })),

  cardFinish: 'glossy',
  setCardFinish: (cardFinish) => set({ cardFinish }),

  edgePreset: 'black',
  setEdgePreset: (edgePreset) => set({ edgePreset }),

  hardwareFinish: 'brushed-steel',
  setHardwareFinish: (hardwareFinish) => set({ hardwareFinish }),

  hologramEnabled: true,
  setHologramEnabled: (hologramEnabled) => set({ hologramEnabled }),

  hologramIntensity: 0.72,
  setHologramIntensity: (hologramIntensity) => set({ hologramIntensity }),

  studioBackdrop: 'obsidian',
  setStudioBackdrop: (studioBackdrop) => set({ studioBackdrop }),

  showLanyard: true,
  toggleLanyard: () => set((state) => ({ showLanyard: !state.showLanyard })),

  isFlipped: false,
  toggleFlip: () => {
    const nextFlipped = !get().isFlipped;
    set({ isFlipped: nextFlipped });
    get().rigBridge?.triggerFlipImpulse(nextFlipped ? Math.PI : 0);
  },
  setFlipped: (flipped) => {
    set({ isFlipped: flipped });
    get().rigBridge?.triggerFlipImpulse(flipped ? Math.PI : 0);
  },

  autoSpin: false,
  toggleAutoSpin: () =>
    set((state) => ({
      autoSpin: !state.autoSpin,
      previewReel: !state.autoSpin ? false : state.previewReel,
    })),

  previewReel: false,
  togglePreviewReel: () =>
    set((state) => {
      const next = !state.previewReel;
      return {
        previewReel: next,
        autoSpin: next ? false : state.autoSpin,
      };
    }),
  setPreviewReel: (previewReel) =>
    set((state) => ({
      previewReel,
      autoSpin: previewReel ? false : state.autoSpin,
    })),

  cameraPreset: 'front',
  cameraRequestNonce: 0,
  setCameraPreset: (cameraPreset) =>
    set((state) => ({
      cameraPreset,
      previewReel: false,
      cameraRequestNonce: state.cameraRequestNonce + 1,
    })),

  exportModalOpen: false,
  exportModalMode: 'still',
  openExportModal: (mode) =>
    set((state) => ({
      exportModalOpen: true,
      exportModalMode: mode,
      mobileDrawerOpen: false,
      renderProgress: {
        ...state.renderProgress,
        mode,
        error: null,
        lastCompletedFile: null,
        percent: 0,
        currentFrame: 0,
      },
    })),
  closeExportModal: () =>
    set((state) => {
      if (state.renderProgress.isRendering) return state;
      return { exportModalOpen: false };
    }),

  exportAspect: '16:9',
  setExportAspect: (exportAspect) => set({ exportAspect }),

  stillFormat: 'png',
  setStillFormat: (stillFormat) => set({ stillFormat }),
  stillTransparentBg: false,
  setStillTransparentBg: (stillTransparentBg) => set({ stillTransparentBg }),

  videoPreset: 'cinematic-reel',
  setVideoPreset: (videoPreset) =>
    set((state) => ({
      videoPreset,
      videoDurationSec:
        videoPreset === 'cinematic-360' && state.videoDurationSec < 14
          ? 14
          : state.videoDurationSec,
    })),
  videoDurationSec: 10,
  setVideoDurationSec: (videoDurationSec) => set({ videoDurationSec }),

  renderProgress: {
    isRendering: false,
    mode: 'still',
    currentFrame: 0,
    totalFrames: 600,
    percent: 0,
    stageLabel: 'Ready to render',
    error: null,
    lastCompletedFile: null,
  },
  setRenderProgress: (patch) =>
    set((state) => ({
      renderProgress: { ...state.renderProgress, ...patch },
    })),

  rigBridge: null,
  registerRigBridge: (rigBridge) => set({ rigBridge }),
}));
