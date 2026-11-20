import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei';
import type CameraControlsImpl from 'camera-controls';
import { AssemblyRig } from './AssemblyRig';
import { useStudioStore, type CameraPresetId } from '../../store/useStudioStore';
import { detectSoftwareWebGL } from '../../utils/webglDetect';
import {
  createInitialFpsMonitorState,
  detectMobileDevice,
  updateFpsMonitor,
} from '../../utils/performanceMonitor';

interface CameraPresetPose {
  position: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetPose> = {
  // Full Lanyard & Card View: frames y = [-5, 40] cm with generous margin above the floating dock
  full: {
    position: [12.5, 16.0, 82.0],
    target: [0, 15.2, 0],
  },
  // Card Front Hero: frames 5.4 x 8.56 cm front face + clasp cleanly above the floating dock
  front: {
    position: [4.2, 0.9, 20.6],
    target: [0, -0.2, 0],
  },
  // Card Back View: smoothly orbits 180 deg around Y to inspect back face above the dock
  back: {
    position: [-4.2, 0.9, -20.6],
    target: [0, -0.2, 0],
  },
  // Clasp & Weave Macro: close-up on y ≈ 4.5-6.8 cm showing 2.0 cm strap weave, crimp & slot punch
  macro: {
    position: [2.8, 5.5, 8.2],
    target: [0, 4.9, 0],
  },
};

const BACKDROP_COLORS: Record<'obsidian' | 'slate' | 'studio-light', string> = {
  obsidian: '#0b0d10',
  slate: '#141821',
  'studio-light': '#e6e8ee',
};

function CameraRigController({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const cameraPreset = useStudioStore((s) => s.cameraPreset);
  const cameraRequestNonce = useStudioStore((s) => s.cameraRequestNonce);
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
    const pose = CAMERA_PRESETS[cameraPreset];
    const shouldAnimate = initializedRef.current && !isSoftwareGl;
    initializedRef.current = true;

    // Reset FOV cleanly when returning from cinematic reel
    const persp = camera as THREE.PerspectiveCamera;
    if (Math.abs(persp.fov - 36) > 0.05) {
      persp.fov = 36;
      persp.updateProjectionMatrix();
    }

    // Pull back gracefully on narrow mobile portrait viewports and when the taller badge case is enabled
    const portraitScale = isPortrait ? (cameraPreset === 'full' ? 1.18 : 1.28) : 1.0;
    const isCaseCloseView = cardCaseEnabled && (cameraPreset === 'front' || cameraPreset === 'back');
    const distScale = portraitScale * (isCaseCloseView ? 1.14 : 1.0);
    const posYOffset = isCaseCloseView ? -0.35 : 0;
    const targetYOffset = isCaseCloseView ? -0.75 : 0;

    controls.setLookAt(
      pose.position[0] * distScale,
      pose.position[1] + posYOffset,
      pose.position[2] * distScale,
      pose.target[0],
      pose.target[1] + targetYOffset,
      pose.target[2],
      shouldAnimate
    );
    invalidate();
  }, [
    cameraPreset,
    cameraRequestNonce,
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
      maxDistance={115.0}
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
  const { scene, invalidate } = useThree();

  useEffect(() => {
    const color = new THREE.Color(BACKDROP_COLORS[studioBackdrop]);
    scene.background = color;
    scene.fog = new THREE.FogExp2(color, 0.0055);
    invalidate();
  }, [studioBackdrop, scene, invalidate]);

  return null;
}

export function StudioScene() {
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const studioBackdrop = useStudioStore((s) => s.studioBackdrop);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const performanceTier = useStudioStore((s) => s.performanceTier);
  const isLightBackdrop = studioBackdrop === 'studio-light';
  const shadowsEnabled = !isSoftwareGl && performanceTier.highFidelityShadows;
  const adaptiveDpr: number | [number, number] = isSoftwareGl
    ? 1
    : performanceTier.lowFpsDegraded
      ? 1
      : [1, performanceTier.maxDpr];

  return (
    <div
      className="relative w-full h-full select-none touch-none"
      data-testid="studio-viewport"
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
          toneMappingExposure: 1.08,
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

        {/* Balanced 3-Point Warm/Cool Studio Rig */}
        <hemisphereLight
          args={[isLightBackdrop ? '#eef4ff' : '#cfdfff', isLightBackdrop ? '#c4c9d4' : '#181a24', 0.55]}
        />

        {/* Warm Directional Key Light casting soft PCF shadows (auto-disabled below 45fps on mobile) */}
        <directionalLight
          position={[14, 24, 18]}
          intensity={1.95}
          color="#fff4e4"
          castShadow={shadowsEnabled}
          shadow-mapSize-width={performanceTier.isMobileDevice ? 512 : 2048}
          shadow-mapSize-height={performanceTier.isMobileDevice ? 512 : 2048}
          shadow-camera-near={1}
          shadow-camera-far={75}
          shadow-camera-left={-18}
          shadow-camera-right={18}
          shadow-camera-top={44}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0003}
          shadow-normalBias={0.015}
        />

        {/* Cool Fill Light from opposite left flank */}
        <directionalLight position={[-16, 12, 12]} intensity={0.72} color="#dbeafe" />

        {/* Crisp Rim Backlight to separate dark edges and illuminate woven strap bevels */}
        <directionalLight position={[0, 18, -22]} intensity={1.15} color="#e0e7ff" />

        {/* Procedural Studio Softbox HDRI Environment (Zero external HDR 404s) */}
        <Environment resolution={256} frames={1}>
          {/* Overhead studio strip softbox */}
          <Lightformer
            form="rect"
            intensity={2.8}
            color="#ffffff"
            scale={[18, 5, 1]}
            position={[0, 26, 4]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          {/* Front diffused bounce card so flat brushed metal surfaces gleam softly */}
          <Lightformer
            form="rect"
            intensity={1.55}
            color="#f1f5f9"
            scale={[18, 14, 1]}
            position={[3, 10, 24]}
            target={[0, 6, 0]}
          />
          {/* Left warm key softbox panel */}
          <Lightformer
            form="rect"
            intensity={2.2}
            color="#fff2dc"
            scale={[14, 22, 1]}
            position={[-18, 12, 12]}
            target={[0, 8, 0]}
          />
          {/* Right cool rim strip for crisp PVC clearcoat & chrome reflections */}
          <Lightformer
            form="rect"
            intensity={2.6}
            color="#c7d8ff"
            scale={[6, 26, 1]}
            position={[18, 14, -6]}
            target={[0, 8, 0]}
          />
          {/* Subtle back overhead accent */}
          <Lightformer
            form="ring"
            intensity={1.3}
            color="#e2e8f0"
            scale={14}
            position={[0, 10, -22]}
            target={[0, 6, 0]}
          />
          {/* Ground bounce fill */}
          <Lightformer
            form="rect"
            intensity={0.5}
            color={isLightBackdrop ? '#ffffff' : '#334155'}
            scale={[40, 40, 1]}
            position={[0, -10, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </Environment>

        {/* Main 3D ID Card, Swivel Clasp Hardware & 80x2cm Lanyard Rig */}
        <AssemblyRig />

        {/* Soft studio floor ContactShadows (automatically disabled on mobile <45fps & hidden on transparent PNGs) */}
        {performanceTier.highFidelityShadows && (
          <group name="studio-contact-shadows">
            <ContactShadows
              position={[0, cardCaseEnabled ? -6.5 : -5.5, 0]}
              opacity={isLightBackdrop ? 0.35 : 0.45}
              scale={25}
              blur={2.2}
              far={16}
              resolution={isSoftwareGl || performanceTier.isMobileDevice ? 256 : 512}
              frames={1}
              color={isLightBackdrop ? '#1e293b' : '#000000'}
            />
          </group>
        )}
      </Canvas>
    </div>
  );
}
