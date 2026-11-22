import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CARD_SPECS } from '../../geometry/cardGeometry';
import { CASE_SPECS } from '../../geometry/caseGeometry';
import { buildNormalizedLanyardCurve } from '../../geometry/lanyardGeometry';
import { getAssemblyTransformForPlacement } from '../../geometry/placementGeometry';
import {
  createInitialSpringState,
  stepLiveSimulation,
  stepOfflinePresetFrame,
  type AnimationPreset,
  type SpringState,
} from '../../utils/physicsEngine';
import { useStudioStore } from '../../store/useStudioStore';
import { CardCaseMesh } from './CardCaseMesh';
import { IdCardMesh } from './IdCardMesh';
import { LanyardMesh, SwivelClaspMesh } from './LanyardMesh';
import { PlacementEnvironments } from './PlacementEnvironments';

/**
 * Hierarchical 3D Assembly Rig (1 unit = 1 cm):
 *  - turntableGroup: rotates the whole scene (placement environment + badge + lanyard) around Y
 *  - PlacementEnvironments: optional studio table, tailor's torso bust, or walnut coat hanger rack
 *  - placementPoseGroup: positions/orients the badge assembly onto the active surface (e.g., flat on desk)
 *  - neckPivotGroup (positioned at top of lanyard loop for the active placement):
 *      applies subtle placement-aware breathing sway (0 on table, chest-safe on torso, natural on hanger/studio)
 *      -> LanyardMesh (80x2cm strap fitted to active placement + crimp + D-ring + swivel barrel)
 *      -> swivelClaspGroup (exact swivel axis at slot punch elevation y = +3.78 cm):
 *          rotates smoothly around Y with `thetaY` so the lobster clasp swivels WITH the card
 *          -> SwivelClaspMesh (clasp body + flush thumb gate + snug hook loop seated in slot)
 *          -> cardPendulumGroup (applies realistic X/Z pendulum sway around hook saddle)
 *              -> CardCaseMesh (optional) + IdCardMesh
 */
export function AssemblyRig() {
  const { gl, scene, camera, invalidate } = useThree();
  const showLanyard = useStudioStore((s) => s.showLanyard);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const placementScene = useStudioStore((s) => s.placementScene);
  const registerRigBridge = useStudioStore((s) => s.registerRigBridge);

  const neckPivotY = useMemo(() => {
    const { topY } = buildNormalizedLanyardCurve(placementScene);
    return topY;
  }, [placementScene]);

  const placementTransform = useMemo(
    () => getAssemblyTransformForPlacement(placementScene, cardCaseEnabled),
    [placementScene, cardCaseEnabled]
  );

  const turntableRef = useRef<THREE.Group>(null);
  const neckPivotRef = useRef<THREE.Group>(null);
  const swivelClaspRef = useRef<THREE.Group>(null);
  const cardPendulumRef = useRef<THREE.Group>(null);

  const springRef = useRef<SpringState>(createInitialSpringState());

  // Apply pure SpringState cleanly onto the hierarchical Three.js Groups + Hermite-spline camera pose
  const applyPoseToGroups = useCallback(
    (pose: SpringState) => {
      const store = useStudioStore.getState();
      const xform = getAssemblyTransformForPlacement(store.placementScene, store.cardCaseEnabled);

      if (turntableRef.current) {
        turntableRef.current.rotation.y = pose.turntableY;
      }
      if (neckPivotRef.current) {
        neckPivotRef.current.rotation.z = pose.neckSwayZ * xform.swayScale;
        neckPivotRef.current.rotation.x = Math.max(
          xform.minCardPitchRad,
          pose.neckSwayX * xform.swayScale
        );
      }
      if (swivelClaspRef.current) {
        // Swivel joint rotates both the lobster clasp AND the ID card together around Y (zero clipping!)
        // In table flat-lay mode, smoothly lift the card up off the desk mat (+Z local = +Y world)
        // during mid-flip so it turns 180° in mid-air and settles flush on its back face!
        swivelClaspRef.current.rotation.y = pose.thetaY;
        if (store.placementScene === 'table') {
          const halfCardWidth = store.cardCaseEnabled
            ? CASE_SPECS.outerWidth / 2
            : CARD_SPECS.width / 2;
          swivelClaspRef.current.position.z =
            Math.abs(Math.sin(pose.thetaY)) * (halfCardWidth + 0.45);
        } else {
          swivelClaspRef.current.position.z = 0;
        }
      }
      if (cardPendulumRef.current) {
        cardPendulumRef.current.rotation.x = Math.max(
          xform.minCardPitchRad,
          pose.thetaX * xform.swayScale
        );
        cardPendulumRef.current.rotation.z = pose.thetaZ * xform.swayScale;
        // Keep holographic foil shader time strictly deterministic across temporal motion-blur sub-frames
        const holoObj = cardPendulumRef.current.getObjectByName('hologram-overlay') as
          | THREE.Mesh
          | undefined;
        if (
          holoObj &&
          holoObj.material instanceof THREE.ShaderMaterial &&
          holoObj.material.uniforms.uTime
        ) {
          holoObj.material.uniforms.uTime.value = pose.simTime;
        }
      }
      if (pose.cameraPose) {
        const persp = camera as THREE.PerspectiveCamera;
        persp.position.set(
          pose.cameraPose.position.x,
          pose.cameraPose.position.y,
          pose.cameraPose.position.z
        );
        persp.lookAt(
          pose.cameraPose.target.x,
          pose.cameraPose.target.y,
          pose.cameraPose.target.z
        );
        if (Math.abs(persp.fov - pose.cameraPose.fov) > 0.01) {
          persp.fov = pose.cameraPose.fov;
          persp.updateProjectionMatrix();
        }
      }
    },
    [camera]
  );

  // Explicit deterministic step function exposed for both live preview and offline rendering
  const stepSimulation = useCallback(
    (dt: number, deterministicTime?: number) => {
      const store = useStudioStore.getState();
      const targetFlipY = store.isFlipped ? Math.PI : 0;
      const persp = camera as THREE.PerspectiveCamera;
      const activePreviewPreset =
        store.videoPreset === 'cinematic-360' ? 'cinematic-360' : 'cinematic-reel';
      const next = stepLiveSimulation(springRef.current, {
        dt,
        targetFlipY,
        autoSpin: store.autoSpin,
        previewReel: store.previewReel,
        previewPreset: activePreviewPreset,
        reelDurationSec: store.videoDurationSec,
        aspect: persp.aspect || 16 / 9,
        deterministicTime,
        placementScene: store.placementScene,
      });
      springRef.current = next;
      applyPoseToGroups(next);
    },
    [applyPoseToGroups, camera]
  );

  // Explicit deterministic offline video preset stepper (Hermite-spline camera + spring rig)
  const stepOfflinePreset = useCallback(
    (
      preset: AnimationPreset,
      frameIndex: number,
      totalFrames: number,
      fps = 24,
      aspect = 16 / 9
    ) => {
      const placementScene = useStudioStore.getState().placementScene;
      const next = stepOfflinePresetFrame(
        springRef.current,
        preset,
        frameIndex,
        totalFrames,
        fps,
        aspect,
        placementScene
      );
      springRef.current = next;
      applyPoseToGroups(next);
    },
    [applyPoseToGroups]
  );

  const resetSimulation = useCallback(() => {
    const initial = createInitialSpringState();
    const isFlipped = useStudioStore.getState().isFlipped;
    initial.thetaY = isFlipped ? Math.PI : 0;
    springRef.current = initial;
    applyPoseToGroups(initial);
    invalidate();
  }, [applyPoseToGroups, invalidate]);

  const triggerFlipImpulse = useCallback(
    (targetY: number) => {
      const dir = targetY > springRef.current.thetaY ? 1 : -1;
      springRef.current.omegaY += dir * 2.4;
      springRef.current.omegaZ -= dir * 0.45;
      invalidate();
    },
    [invalidate]
  );

  // Register imperative bridge for FloatingDock and renderEngine.ts
  useEffect(() => {
    registerRigBridge({
      stepSimulation,
      stepOfflinePreset,
      resetSimulation,
      triggerFlipImpulse,
      getSceneRefs: () => ({
        gl,
        scene,
        camera: camera as THREE.PerspectiveCamera,
        invalidate,
      }),
    });
    return () => registerRigBridge(null);
  }, [
    gl,
    scene,
    camera,
    invalidate,
    registerRigBridge,
    stepSimulation,
    stepOfflinePreset,
    resetSimulation,
    triggerFlipImpulse,
  ]);

  // Re-apply resting pose cleanly whenever placement scene changes
  useEffect(() => {
    applyPoseToGroups(springRef.current);
    invalidate();
  }, [placementScene, cardCaseEnabled, applyPoseToGroups, invalidate]);

  // Live preview simulation loop (paused automatically during offline renders!)
  useFrame((_state, delta) => {
    const store = useStudioStore.getState();
    if (store.renderProgress.isRendering) return;
    stepSimulation(Math.min(delta, 0.05));
  });

  // Relative Y offset of the card slot punch below the top neck pivot
  const hingeLocalY = CARD_SPECS.slotCenterY - neckPivotY;

  return (
    <group ref={turntableRef} name="assembly-turntable-root">
      {/* Real-world 3D placement environment (Table / Torso / Hanger) */}
      <PlacementEnvironments placement={placementScene} />

      {/* Positioned & oriented badge + lanyard assembly */}
      <group
        position={placementTransform.position}
        rotation={placementTransform.rotation}
        name="placement-assembly-pose"
      >
        {/* Top Neck Pivot */}
        <group ref={neckPivotRef} position={[0, neckPivotY, 0]} name="neck-pivot">
          {showLanyard && <LanyardMesh neckPivotY={neckPivotY} />}

          {/* Swivel Clasp & Card/Case Pivot at exact slot punch elevation (world y = +3.78 cm) */}
          <group ref={swivelClaspRef} position={[0, hingeLocalY, 0]} name="swivel-clasp-pivot">
            {showLanyard && <SwivelClaspMesh pivotOffsetY={CARD_SPECS.slotCenterY} />}
            <group ref={cardPendulumRef} name="card-pendulum-pivot">
              {cardCaseEnabled && <CardCaseMesh />}
              <group position={[0, cardCaseEnabled ? -CASE_SPECS.cardDropY : 0, 0]}>
                <IdCardMesh />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
