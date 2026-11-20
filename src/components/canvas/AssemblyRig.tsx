import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CARD_SPECS } from '../../geometry/cardGeometry';
import { buildNormalizedLanyardCurve } from '../../geometry/lanyardGeometry';
import {
  createInitialSpringState,
  stepLiveSimulation,
  stepOfflinePresetFrame,
  type AnimationPreset,
  type SpringState,
} from '../../utils/physicsEngine';
import { useStudioStore } from '../../store/useStudioStore';
import { IdCardMesh } from './IdCardMesh';
import { LanyardMesh } from './LanyardMesh';

/**
 * Hierarchical 3D Assembly Rig (1 unit = 1 cm):
 *  - turntableGroup: rotates the whole badge+lanyard assembly around Y
 *  - neckPivotGroup (positioned at top of lanyard loop, y ≈ 39.5 cm):
 *      applies subtle low-amplitude breathing sway (+/- 0.015 rad at 0.4 Hz)
 *      -> LanyardMesh (strap + crimp + swivel + lobster hook)
 *      -> claspHingeGroup (exact slot punch center at y = +3.78 cm):
 *          critically damped spring harmonic oscillator for realistic card pendulum & 180° flips
 *          -> IdCardMesh
 */
export function AssemblyRig() {
  const { gl, scene, camera, invalidate } = useThree();
  const showLanyard = useStudioStore((s) => s.showLanyard);
  const registerRigBridge = useStudioStore((s) => s.registerRigBridge);

  const neckPivotY = useMemo(() => {
    const { topY } = buildNormalizedLanyardCurve();
    return topY;
  }, []);

  const turntableRef = useRef<THREE.Group>(null);
  const neckPivotRef = useRef<THREE.Group>(null);
  const claspHingeRef = useRef<THREE.Group>(null);

  const springRef = useRef<SpringState>(createInitialSpringState());

  // Apply pure SpringState cleanly onto the 3 hierarchical Three.js Groups (zero allocations)
  const applyPoseToGroups = useCallback((pose: SpringState) => {
    if (turntableRef.current) {
      turntableRef.current.rotation.y = pose.turntableY;
    }
    if (neckPivotRef.current) {
      neckPivotRef.current.rotation.z = pose.neckSwayZ;
      neckPivotRef.current.rotation.x = pose.neckSwayX;
    }
    if (claspHingeRef.current) {
      claspHingeRef.current.rotation.y = pose.thetaY;
      claspHingeRef.current.rotation.x = pose.thetaX;
      claspHingeRef.current.rotation.z = pose.thetaZ;
    }
  }, []);

  // Explicit deterministic step function exposed for both live preview and offline rendering
  const stepSimulation = useCallback(
    (dt: number, deterministicTime?: number) => {
      const store = useStudioStore.getState();
      const targetFlipY = store.isFlipped ? Math.PI : 0;
      const next = stepLiveSimulation(springRef.current, {
        dt,
        targetFlipY,
        autoSpin: store.autoSpin,
        deterministicTime,
      });
      springRef.current = next;
      applyPoseToGroups(next);
    },
    [applyPoseToGroups]
  );

  // Explicit deterministic offline video preset stepper
  const stepOfflinePreset = useCallback(
    (preset: AnimationPreset, frameIndex: number, totalFrames: number, fps = 60) => {
      const next = stepOfflinePresetFrame(
        springRef.current,
        preset,
        frameIndex,
        totalFrames,
        fps
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
      // Impart crisp angular momentum impulse so the card swings naturally around the clasp hinge
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
      {/* Top Neck Pivot (y ≈ 39.5 cm) */}
      <group ref={neckPivotRef} position={[0, neckPivotY, 0]} name="neck-pivot">
        {showLanyard && <LanyardMesh neckPivotY={neckPivotY} />}

        {/* Clasp Hinge Pivot at exact center of CR80 slot punch (world y = +3.78 cm) */}
        <group ref={claspHingeRef} position={[0, hingeLocalY, 0]} name="clasp-hinge-pivot">
          <IdCardMesh />
        </group>
      </group>
    </group>
  );
}
