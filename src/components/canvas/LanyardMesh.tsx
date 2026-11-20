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
  'brushed-steel': { color: '#dde2eb', metalness: 0.88, roughness: 0.28, anisotropy: 0.8 },
  'matte-black': { color: '#2b2e35', metalness: 0.78, roughness: 0.42, anisotropy: 0.4 },
  'champagne-gold': { color: '#e2bd6a', metalness: 0.9, roughness: 0.24, anisotropy: 0.85 },
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
      clearcoat: 0.25,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.35,
    });
  }, []);

  const accentHardwareMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: '#aeb5c2',
      metalness: 0.92,
      roughness: 0.34,
      anisotropy: 0.6,
      envMapIntensity: 1.2,
    });
  }, []);

  useEffect(() => {
    return () => {
      hardwareMaterial.dispose();
      accentHardwareMaterial.dispose();
    };
  }, [hardwareMaterial, accentHardwareMaterial]);

  useEffect(() => {
    const cfg = HARDWARE_MATERIAL_CONFIGS[hardwareFinish];
    hardwareMaterial.color.set(cfg.color);
    hardwareMaterial.metalness = cfg.metalness;
    hardwareMaterial.roughness = cfg.roughness;
    hardwareMaterial.anisotropy = cfg.anisotropy;
    hardwareMaterial.needsUpdate = true;

    const accentColor = new THREE.Color(cfg.color).multiplyScalar(0.84);
    accentHardwareMaterial.color.copy(accentColor);
    accentHardwareMaterial.metalness = cfg.metalness;
    accentHardwareMaterial.roughness = Math.min(0.65, cfg.roughness + 0.14);
    accentHardwareMaterial.needsUpdate = true;
    invalidate();
  }, [hardwareFinish, hardwareMaterial, accentHardwareMaterial, invalidate]);

  return { hardwareMaterial, accentHardwareMaterial };
}

export interface LanyardMeshProps {
  /** Vertical offset applied so the neck apex sits at the parent pivot origin */
  neckPivotY: number;
}

/**
 * Renders the 80.0 x 2.0 cm continuous dye-sublimated woven polyester strap
 * plus the upper fixed crimp/D-ring/swivel-barrel hardware.
 */
export function LanyardMesh({ neckPivotY }: LanyardMeshProps) {
  const { gl, invalidate } = useThree();
  const lanyardLayer = useStudioStore((s) => s.layers.lanyard);
  const activeTemplate = useStudioStore((s) => s.activeTemplate);
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);

  const { geometry: strapGeometry } = useMemo(() => createLanyardGeometry(), []);
  const hardwareGeos = useMemo(() => createHardwareGeometries(), []);
  const { hardwareMaterial, accentHardwareMaterial } = useHardwareMaterials();

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
    return () => {
      strapGeometry.dispose();
      disposeHardwareGeometries(hardwareGeos);
      fabricMaps.dispose();
      strapTexture.dispose();
      strapMaterial.dispose();
    };
  }, [strapGeometry, hardwareGeos, fabricMaps, strapTexture, strapMaterial]);

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

      {/* Upper fixed metallic hardware attached to lanyard apex (crimp + D-ring + swivel barrel) */}
      <group name="upper-clasp-hardware-group">
        <mesh
          geometry={hardwareGeos.crimpClamp}
          material={hardwareMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh
          geometry={hardwareGeos.crimpCollar}
          material={accentHardwareMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh
          geometry={hardwareGeos.swivelRing}
          material={hardwareMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh
          geometry={hardwareGeos.swivelBarrel}
          material={accentHardwareMaterial}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
      </group>
    </group>
  );
}

/**
 * Lower swivel lobster clasp assembly (body + flush thumb gate + snug hook loop)
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
      />
      <mesh
        geometry={hardwareGeos.claspThumbTrigger}
        material={accentHardwareMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
      />
      <mesh
        geometry={hardwareGeos.claspHookLoop}
        material={hardwareMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
      />
    </group>
  );
}
