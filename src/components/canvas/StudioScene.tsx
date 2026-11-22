import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei';
import type CameraControlsImpl from 'camera-controls';
import { AssemblyRig } from './AssemblyRig';
import { useStudioStore } from '../../store/useStudioStore';
import {
  PLACEMENT_SPECS,
  getPlacementCameraPose,
} from '../../geometry/placementGeometry';
import { detectSoftwareWebGL } from '../../utils/webglDetect';
import {
  createInitialFpsMonitorState,
  detectMobileDevice,
  updateFpsMonitor,
} from '../../utils/performanceMonitor';

const BACKDROP_COLORS: Record<'obsidian' | 'slate' | 'studio-light', string> = {
  obsidian: '#0b0d10',
  slate: '#141821',
  'studio-light': '#dde2ea',
};

const BACKDROP_EXPOSURES: Record<'obsidian' | 'slate' | 'studio-light', number> = {
  obsidian: 1.04,
  slate: 1.04,
  'studio-light': 0.94,
};

function CameraRigController({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const cameraPreset = useStudioStore((s) => s.cameraPreset);
  const cameraRequestNonce = useStudioStore((s) => s.cameraRequestNonce);
  const placementScene = useStudioStore((s) => s.placementScene);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const previewReel = useStudioStore((s) => s.previewReel);
  const isRendering = useStudioStore((s) => s.renderProgress.isRendering);
  const { invalidate, size, camera } = useThree();

  // Set initial hero framing immediately on mount (without sweeping from origin)
  const initializedRef = useRef(false);
  const isPortrait = size.width > 0 && size.height > 0 && size.width / size.height < 0.85;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || previewReel || isRendering) return;
    const pose = getPlacementCameraPose(placementScene, cameraPreset, {
      isPortrait,
      cardCaseEnabled,
    });
    const shouldAnimate = initializedRef.current && !isSoftwareGl;
    initializedRef.current = true;

    // Reset FOV cleanly when returning from cinematic reel
    const persp = camera as THREE.PerspectiveCamera;
    if (Math.abs(persp.fov - 36) > 0.05) {
      persp.fov = 36;
      persp.updateProjectionMatrix();
    }

    controls.setLookAt(
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.target[0],
      pose.target[1],
      pose.target[2],
      shouldAnimate
    );
    invalidate();
  }, [
    cameraPreset,
    cameraRequestNonce,
    placementScene,
    cardCaseEnabled,
    previewReel,
    isRendering,
    isPortrait,
    isSoftwareGl,
    camera,
    invalidate,
  ]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      enabled={!previewReel && !isRendering}
      smoothTime={isSoftwareGl ? 0.01 : 0.45}
      minDistance={5.0}
      maxDistance={145.0}
      minPolarAngle={0.18}
      maxPolarAngle={Math.PI - 0.18}
      dollySpeed={0.85}
      azimuthRotateSpeed={0.8}
      polarRotateSpeed={0.8}
      onChange={() => invalidate()}
    />
  );
}

/**
 * Software-WebGL frame pacer: on SwiftShader/CPU renderers, we run R3F in `demand`
 * mode and schedule `invalidate()` after the GPU fence completes + 80ms pause when
 * continuous motion (autoSpin, previewReel, or flip settling) is active so browser
 * responsiveness and automated screenshots never stall.
 */
function SoftwareGlPacer({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const { gl, invalidate } = useThree();
  const autoSpin = useStudioStore((s) => s.autoSpin);
  const previewReel = useStudioStore((s) => s.previewReel);
  const isFlipped = useStudioStore((s) => s.isFlipped);
  const showLanyard = useStudioStore((s) => s.showLanyard);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const cardCaseStyle = useStudioStore((s) => s.cardCaseStyle);
  const hologramEnabled = useStudioStore((s) => s.hologramEnabled);
  const studioBackdrop = useStudioStore((s) => s.studioBackdrop);
  const placementScene = useStudioStore((s) => s.placementScene);

  // Trigger a clean draw on any visual state change
  useEffect(() => {
    if (!isSoftwareGl) return;
    const id = window.setTimeout(() => invalidate(), 16);
    return () => window.clearTimeout(id);
  }, [
    isSoftwareGl,
    isFlipped,
    showLanyard,
    cardCaseEnabled,
    cardCaseStyle,
    hologramEnabled,
    studioBackdrop,
    placementScene,
    previewReel,
    invalidate,
  ]);

  // Step flip animation cleanly on software GL
  useEffect(() => {
    if (!isSoftwareGl) return;
    let cancelled = false;
    let remaining = 18;
    let timerId = 0;

    const scheduleNext = () => {
      if (cancelled || remaining <= 0) return;
      remaining -= 1;
      invalidate();
      const rawGl = gl.getContext() as WebGL2RenderingContext;
      if (rawGl && typeof rawGl.fenceSync === 'function') {
        const sync = rawGl.fenceSync(rawGl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        rawGl.flush();
        const poll = () => {
          if (cancelled) {
            if (sync) rawGl.deleteSync(sync);
            return;
          }
          const status = sync ? rawGl.getSyncParameter(sync, rawGl.SYNC_STATUS) : rawGl.SIGNALED;
          if (status === rawGl.UNSIGNALED) {
            timerId = window.setTimeout(poll, 8);
          } else {
            if (sync) rawGl.deleteSync(sync);
            timerId = window.setTimeout(scheduleNext, 80);
          }
        };
        timerId = window.setTimeout(poll, 8);
      } else {
        timerId = window.setTimeout(scheduleNext, 90);
      }
    };

    timerId = window.setTimeout(scheduleNext, 20);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [isSoftwareGl, isFlipped, gl, invalidate]);

  // Paced auto-spin or cinematic reel preview on software GL
  useEffect(() => {
    if (!isSoftwareGl || (!autoSpin && !previewReel)) return;
    let cancelled = false;
    let timerId = 0;

    const tick = () => {
      if (cancelled) return;
      invalidate();
      const rawGl = gl.getContext() as WebGL2RenderingContext;
      if (rawGl && typeof rawGl.fenceSync === 'function') {
        const sync = rawGl.fenceSync(rawGl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        rawGl.flush();
        const poll = () => {
          if (cancelled) {
            if (sync) rawGl.deleteSync(sync);
            return;
          }
          const status = sync ? rawGl.getSyncParameter(sync, rawGl.SYNC_STATUS) : rawGl.SIGNALED;
          if (status === rawGl.UNSIGNALED) {
            timerId = window.setTimeout(poll, 8);
          } else {
            if (sync) rawGl.deleteSync(sync);
            timerId = window.setTimeout(tick, 90);
          }
        };
        timerId = window.setTimeout(poll, 8);
      } else {
        timerId = window.setTimeout(tick, 100);
      }
    };

    timerId = window.setTimeout(tick, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [isSoftwareGl, autoSpin, previewReel, gl, invalidate]);

  return null;
}

function MobilePerformanceMonitor({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const { invalidate } = useThree();
  const monitorRef = useRef(createInitialFpsMonitorState(detectMobileDevice()));

  // Re-evaluate mobile classification cleanly on viewport resize / orientation change
  useEffect(() => {
    const syncDeviceClass = () => {
      const mobile = detectMobileDevice();
      if (monitorRef.current.tier.isMobileDevice !== mobile) {
        monitorRef.current = createInitialFpsMonitorState(mobile);
        useStudioStore.getState().setPerformanceTier(monitorRef.current.tier);
        invalidate();
      }
    };
    syncDeviceClass();
    window.addEventListener('resize', syncDeviceClass);
    return () => window.removeEventListener('resize', syncDeviceClass);
  }, [invalidate]);

  useFrame((_state, delta) => {
    const store = useStudioStore.getState();
    const { nextState, tierChanged } = updateFpsMonitor(monitorRef.current, delta, {
      isOfflineRendering: store.renderProgress.isRendering,
      isSoftwareGl,
    });
    monitorRef.current = nextState;
    if (tierChanged) {
      store.setPerformanceTier(nextState.tier);
      invalidate();
    }
  });

  return null;
}

function StudioBackdropController() {
  const studioBackdrop = useStudioStore((s) => s.studioBackdrop);
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const color = new THREE.Color(BACKDROP_COLORS[studioBackdrop]);
    scene.background = color;
    // Never apply bright white exponential fog on studio-light (that washes out shadows & dark colors!)
    scene.fog =
      studioBackdrop === 'studio-light' ? null : new THREE.FogExp2(color, 0.0022);
    // Calibrate ACES exposure so Studio Light stays rich & high-contrast in viewport, 12MP stills & MP4 renders
    gl.toneMappingExposure = BACKDROP_EXPOSURES[studioBackdrop];
    invalidate();
  }, [studioBackdrop, gl, scene, invalidate]);

  return null;
}

export function StudioScene() {
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const studioBackdrop = useStudioStore((s) => s.studioBackdrop);
  const placementScene = useStudioStore((s) => s.placementScene);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const performanceTier = useStudioStore((s) => s.performanceTier);
  const isLightBackdrop = studioBackdrop === 'studio-light';
  const shadowsEnabled = !isSoftwareGl && performanceTier.highFidelityShadows;
  const adaptiveDpr: number | [number, number] = isSoftwareGl
    ? 1
    : performanceTier.lowFpsDegraded
      ? 1
      : [1, performanceTier.maxDpr];

  const contactShadowY =
    placementScene === 'table'
      ? PLACEMENT_SPECS.table.matTopY + 0.015
      : placementScene === 'torso'
        ? PLACEMENT_SPECS.torso.standFloorY + 0.02
        : placementScene === 'hanger'
          ? PLACEMENT_SPECS.hanger.rackFloorY + 0.02
          : cardCaseEnabled
            ? -6.5
            : -5.5;

  return (
    <div
      className="relative w-full h-full select-none touch-none"
      data-testid="studio-viewport"
      data-placement={placementScene}
      data-software-gl={isSoftwareGl ? 'true' : 'false'}
      data-mobile={performanceTier.isMobileDevice ? 'true' : 'false'}
      data-msaa={String(performanceTier.msaaSamples)}
      data-shadows={shadowsEnabled ? 'high' : 'off'}
    >
      <Canvas
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        dpr={adaptiveDpr}
        shadows={shadowsEnabled}
        camera={{ position: [4.2, 0.9, 20.6], fov: 36, near: 0.2, far: 280 }}
        gl={{
          antialias: !isSoftwareGl && performanceTier.msaaSamples > 0,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: isLightBackdrop ? 0.94 : 1.04,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          const dom = gl.domElement;
          dom.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
          });
        }}
      >
        <MobilePerformanceMonitor isSoftwareGl={isSoftwareGl} />
        <StudioBackdropController />
        <SoftwareGlPacer isSoftwareGl={isSoftwareGl} />
        <CameraRigController isSoftwareGl={isSoftwareGl} />

        {/* Commercial Photography 4:1 Key-to-Fill Rig with Negative Fill for Rich Shadow Contrast */}
        <hemisphereLight
          args={[
            isLightBackdrop ? '#dce6f5' : '#c6d8f5',
            isLightBackdrop ? '#2c3342' : '#12151f',
            isLightBackdrop ? 0.22 : 0.34,
          ]}
        />

        {/* Sculpted Warm Directional Key Light casting crisp soft shadows */}
        <directionalLight
          position={placementScene === 'table' ? [20, 36, 22] : [20, 32, 24]}
          intensity={isLightBackdrop ? 2.15 : 2.35}
          color="#fff5e6"
          castShadow={shadowsEnabled}
          shadow-mapSize-width={performanceTier.isMobileDevice ? 512 : 2048}
          shadow-mapSize-height={performanceTier.isMobileDevice ? 512 : 2048}
          shadow-camera-near={1}
          shadow-camera-far={130}
          shadow-camera-left={-46}
          shadow-camera-right={46}
          shadow-camera-top={60}
          shadow-camera-bottom={-46}
          shadow-bias={-0.00025}
          shadow-normalBias={0.025}
        />

        {/* Restrained Cool Fill Light from opposite left flank (preserves sculptural midtone modeling) */}
        <directionalLight
          position={[-18, 12, 14]}
          intensity={isLightBackdrop ? 0.34 : 0.48}
          color="#cfe0ff"
        />

        {/* Grazing Rim Backlight separating dark wood/linen/card silhouettes cleanly */}
        <directionalLight
          position={[-4, 18, -24]}
          intensity={isLightBackdrop ? 0.85 : 1.15}
          color="#dce8ff"
        />

        {/* Procedural Studio Softbox & Negative-Fill Flag HDRI Environment (Zero external HDR 404s) */}
        <Environment
          resolution={256}
          frames={1}
          environmentIntensity={isLightBackdrop ? 0.68 : 0.92}
        >
          {/* Overhead studio strip softbox */}
          <Lightformer
            form="rect"
            intensity={2.6}
            color="#fffcf7"
            scale={[18, 5, 1]}
            position={[0, 26, 4]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          {/* Controlled front bounce card for brushed steel gleam without washing out card artwork */}
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#e8eef7"
            scale={[14, 12, 1]}
            position={[4, 12, 26]}
            target={[0, 6, 0]}
          />
          {/* Warm sculpted key softbox panel */}
          <Lightformer
            form="rect"
            intensity={2.35}
            color="#fff0d8"
            scale={[14, 22, 1]}
            position={[20, 16, 14]}
            target={[0, 8, 0]}
          />
          {/* Cool chrome edge rim strip */}
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#bfd4ff"
            scale={[5, 26, 1]}
            position={[-20, 14, -8]}
            target={[0, 8, 0]}
          />
          {/* Subtle back overhead halo */}
          <Lightformer
            form="ring"
            intensity={1.15}
            color="#dce6f5"
            scale={14}
            position={[0, 10, -24]}
            target={[0, 6, 0]}
          />
          {/* Negative-fill dark studio floor bounce (keeps dark blacks rich even on Studio Light!) */}
          <Lightformer
            form="rect"
            intensity={0.28}
            color="#1e2430"
            scale={[44, 44, 1]}
            position={[0, -12, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </Environment>

        {/* Main 3D ID Card, Swivel Clasp Hardware & 80x2cm Lanyard Rig */}
        <AssemblyRig />

        {/* Soft studio floor ContactShadows (automatically disabled on mobile <45fps & hidden on transparent PNGs) */}
        {performanceTier.highFidelityShadows && (
          <group name="studio-contact-shadows">
            <ContactShadows
              key={placementScene}
              position={[0, contactShadowY, placementScene === 'table' ? -2 : 0]}
              opacity={isLightBackdrop ? 0.44 : 0.52}
              scale={placementScene === 'studio' ? 25 : 64}
              blur={placementScene === 'table' ? 1.6 : 2.1}
              far={placementScene === 'table' ? 10 : 28}
              resolution={isSoftwareGl || performanceTier.isMobileDevice ? 256 : 512}
              frames={1}
              color={isLightBackdrop ? '#0f172a' : '#000000'}
            />
          </group>
        )}
      </Canvas>
    </div>
  );
}
