import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { createLanyardGeometry } from '../../geometry/lanyardGeometry';
import {
  createHardwareGeometries,
  disposeHardwareGeometries,
} from '../../geometry/hardwareGeometry';
import { createFabricMaps } from '../../materials/FabricNormalGenerator';
import {
  LAYER_DIMENSIONS,
  createConfiguredCanvasTexture,
  renderLayerToCanvas,
} from '../../utils/texturePipeline';
import { useStudioStore, type HardwareFinish } from '../../store/useStudioStore';

const HARDWARE_MATERIAL_CONFIGS: Record<
  HardwareFinish,
  { color: string; metalness: number; roughness: number; anisotropy: number }
> = {
  'brushed-steel': { color: '#e2e7f0', metalness: 0.9, roughness: 0.22, anisotropy: 0.75 },
  'matte-black': { color: '#2b2e35', metalness: 0.78, roughness: 0.42, anisotropy: 0.4 },
  'champagne-gold': { color: '#e2bd6a', metalness: 0.9, roughness: 0.22, anisotropy: 0.85 },
};

function useHardwareMaterials() {
  const { invalidate } = useThree();
  const hardwareFinish = useStudioStore((s) => s.hardwareFinish);

  const hardwareMaterial = useMemo(() => {
    const cfg = HARDWARE_MATERIAL_CONFIGS['brushed-steel'];
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      metalness: cfg.metalness,
      roughness: cfg.roughness,
      anisotropy: cfg.anisotropy,
      clearcoat: 0.3,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.45,
    });
  }, []);

  const accentHardwareMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: '#b8c0ce',
      metalness: 0.92,
      roughness: 0.28,
      anisotropy: 0.6,
      clearcoat: 0.2,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.3,
    });
  }, []);

  // Dedicated smooth isotropic dome material for pressed double-cap rivets (prevents polar anisotropy starburst!)
  const rivetMaterial = useMemo(() => {
    const cfg = HARDWARE_MATERIAL_CONFIGS['brushed-steel'];
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      metalness: 0.92,
      roughness: 0.19,
      anisotropy: 0,
      clearcoat: 0.32,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.5,
    });
  }, []);

  // Authentic satin-matte injection-molded black POM/acetal for center-push quick-release buckle female sleeve
  const buckleMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: '#22252c',
      metalness: 0.04,
      roughness: 0.42,
      clearcoat: 0.24,
      clearcoatRoughness: 0.34,
      envMapIntensity: 1.15,
    });
  }, []);

  // Velvety dark satin POM for the concave center-push circular thumb button & cantilevered male insert
  const buckleAccentMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: '#1b1e24',
      metalness: 0.03,
      roughness: 0.46,
      clearcoat: 0.20,
      clearcoatRoughness: 0.36,
      envMapIntensity: 1.1,
    });
  }, []);

  useEffect(() => {
    return () => {
      hardwareMaterial.dispose();
      accentHardwareMaterial.dispose();
      rivetMaterial.dispose();
      buckleMaterial.dispose();
      buckleAccentMaterial.dispose();
    };
  }, [hardwareMaterial, accentHardwareMaterial, rivetMaterial, buckleMaterial, buckleAccentMaterial]);

  useEffect(() => {
    const cfg = HARDWARE_MATERIAL_CONFIGS[hardwareFinish];
    hardwareMaterial.color.set(cfg.color);
    hardwareMaterial.metalness = cfg.metalness;
    hardwareMaterial.roughness = cfg.roughness;
    hardwareMaterial.anisotropy = cfg.anisotropy;
    hardwareMaterial.needsUpdate = true;

    const accentColor = new THREE.Color(cfg.color).multiplyScalar(0.86);
    accentHardwareMaterial.color.copy(accentColor);
    accentHardwareMaterial.metalness = cfg.metalness;
    accentHardwareMaterial.roughness = Math.min(0.62, cfg.roughness + 0.12);
    accentHardwareMaterial.needsUpdate = true;

    rivetMaterial.color.set(cfg.color);
    rivetMaterial.metalness = hardwareFinish === 'matte-black' ? 0.8 : 0.92;
    rivetMaterial.roughness = hardwareFinish === 'matte-black' ? 0.36 : 0.19;
    rivetMaterial.needsUpdate = true;
    invalidate();
  }, [hardwareFinish, hardwareMaterial, accentHardwareMaterial, rivetMaterial, invalidate]);

  return {
    hardwareMaterial,
    accentHardwareMaterial,
    rivetMaterial,
    buckleMaterial,
    buckleAccentMaterial,
  };
}

export interface LanyardMeshProps {
  /** Vertical offset applied so the neck apex sits at the parent pivot origin */
  neckPivotY: number;
}

/**
 * Renders the 80.0 x 2.0 cm continuous dye-sublimated woven polyester strap
 * plus the upper fixed reference hardware assembly:
 *  - Upper & lower polished domed rivets ("paku keling")
 *  - Matte-black side-release stopper buckle with center circular boss & side pinch tabs
 *  - Lower detachable woven webbing tab (mapped seamlessly with the active lanyard design)
 *  - Circular polished split O-ring ("ring O") & turned swivel barrel collar
 */
export function LanyardMesh({ neckPivotY }: LanyardMeshProps) {
  const { gl, invalidate } = useThree();
  const lanyardLayer = useStudioStore((s) => s.layers.lanyard);
  const activeTemplate = useStudioStore((s) => s.activeTemplate);
  const placementScene = useStudioStore((s) => s.placementScene);
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);

  const { geometry: strapGeometry } = useMemo(
    () => createLanyardGeometry(placementScene),
    [placementScene]
  );
  const hardwareGeos = useMemo(() => createHardwareGeometries(), []);
  const {
    hardwareMaterial,
    accentHardwareMaterial,
    rivetMaterial,
    buckleMaterial,
    buckleAccentMaterial,
  } = useHardwareMaterials();

  // Procedural 256x256 twill polyester normal & roughness maps
  const fabricMaps = useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    return createFabricMaps(maxAniso);
  }, [gl]);

  // Offscreen 2400x60 strap texture
  const { strapCanvas, strapTexture } = useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    const canvas = document.createElement('canvas');
    canvas.width = LAYER_DIMENSIONS.lanyard.width;
    canvas.height = LAYER_DIMENSIONS.lanyard.height;

    const store = useStudioStore.getState();
    renderLayerToCanvas(canvas, 'lanyard', store.layers.lanyard, store.activeTemplate, null);

    return {
      strapCanvas: canvas,
      strapTexture: createConfiguredCanvasTexture(canvas, 'lanyard', maxAniso),
    };
  }, [gl]);

  // Rich, high-contrast woven polyester PBR material (restrained sheen preserves deep saturated dye colors!)
  const strapMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: strapTexture,
      normalMap: fabricMaps.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: fabricMaps.roughnessMap,
      roughness: 0.84,
      metalness: 0.0,
      sheen: 0.22,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color('#dbeafe'),
      envMapIntensity: 0.42,
      side: THREE.DoubleSide,
    });
  }, [strapTexture, fabricMaps]);

  useEffect(() => {
    invalidate();
    return () => {
      strapGeometry.dispose();
    };
  }, [strapGeometry, invalidate]);

  useEffect(() => {
    return () => {
      disposeHardwareGeometries(hardwareGeos);
      fabricMaps.dispose();
      strapTexture.dispose();
      strapMaterial.dispose();
    };
  }, [hardwareGeos, fabricMaps, strapTexture, strapMaterial]);

  const imgCache = useRef<{ url: string | null; img: HTMLImageElement | null }>({
    url: null,
    img: null,
  });

  // Re-compile 2400x60 strap CanvasTexture only when lanyard layer changes
  useEffect(() => {
    let cancelled = false;
    const compile = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      renderLayerToCanvas(strapCanvas, 'lanyard', lanyardLayer, activeTemplate, img);
      strapTexture.needsUpdate = true;
      invalidate();
    };

    if (!lanyardLayer.uploadedImageUrl) {
      imgCache.current = { url: null, img: null };
      compile(null);
      return;
    }

    if (imgCache.current.url === lanyardLayer.uploadedImageUrl && imgCache.current.img) {
      compile(imgCache.current.img);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgCache.current = { url: lanyardLayer.uploadedImageUrl, img };
      compile(img);
    };
    img.src = lanyardLayer.uploadedImageUrl;

    return () => {
      cancelled = true;
    };
  }, [strapCanvas, strapTexture, lanyardLayer, activeTemplate, invalidate]);

  return (
    <group position={[0, -neckPivotY, 0]} name="lanyard-and-upper-hardware-group">
      {/* 80.0 x 2.0 cm continuous woven polyester strap */}
      <mesh
        geometry={strapGeometry}
        material={strapMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="lanyard-strap"
      />

      {/* Upper fixed stopper buckle + riveted webbing tab + split O-ring + swivel collar */}
      <group name="upper-clasp-hardware-group">
        <mesh
          geometry={hardwareGeos.buckleBody}
          material={buckleMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
          name="lanyard-stopper-buckle-body"
        />
        <mesh
          geometry={hardwareGeos.buckleAccent}
          material={buckleAccentMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
          name="lanyard-stopper-buckle-accent"
        />
        <mesh
          geometry={hardwareGeos.lowerStrapTab}
          material={strapMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
          name="lanyard-lower-strap-tab"
        />
        <mesh
          geometry={hardwareGeos.rivets}
          material={rivetMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
          name="lanyard-rivet-studs"
        />
        <mesh
          geometry={hardwareGeos.splitRing}
          material={hardwareMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
          name="lanyard-split-o-ring"
        />
        <mesh
          geometry={hardwareGeos.swivelBarrel}
          material={accentHardwareMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
          name="lanyard-swivel-barrel"
        />
      </group>
    </group>
  );
}

/**
 * Lower swivel teardrop lobster clasp assembly (stem + spring gate + pivot pin + thumb trigger + oval hook loop)
 * mounted inside the swivel pivot so the clasp rotates physically WITH the ID card during 180° flips.
 */
export function SwivelClaspMesh({ pivotOffsetY }: { pivotOffsetY: number }) {
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);
  const hardwareGeos = useMemo(() => createHardwareGeometries(), []);
  const { hardwareMaterial, accentHardwareMaterial } = useHardwareMaterials();

  useEffect(() => {
    return () => {
      disposeHardwareGeometries(hardwareGeos);
    };
  }, [hardwareGeos]);

  return (
    <group position={[0, -pivotOffsetY, 0]} name="swivel-lobster-clasp-group">
      <mesh
        geometry={hardwareGeos.claspBody}
        material={hardwareMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="lobster-clasp-body"
      />
      <mesh
        geometry={hardwareGeos.claspThumbTrigger}
        material={accentHardwareMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="lobster-clasp-trigger"
      />
      <mesh
        geometry={hardwareGeos.claspHookLoop}
        material={hardwareMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="lobster-clasp-hook-loop"
      />
    </group>
  );
}
