import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CARD_SPECS,
  createCardGeometry,
  createHologramOverlayGeometry,
} from '../../geometry/cardGeometry';
import { createHologramMaterial } from '../../materials/HologramShader';
import {
  LAYER_DIMENSIONS,
  createConfiguredCanvasTexture,
  renderLayerToCanvas,
} from '../../utils/texturePipeline';
import { useStudioStore, type EdgeMaterialPreset } from '../../store/useStudioStore';

const EDGE_MATERIAL_CONFIGS: Record<
  EdgeMaterialPreset,
  { color: string; roughness: number; metalness: number; clearcoat: number }
> = {
  white: { color: '#f4f4f6', roughness: 0.34, metalness: 0.02, clearcoat: 0.35 },
  black: { color: '#141417', roughness: 0.28, metalness: 0.06, clearcoat: 0.5 },
  gold: { color: '#d4af37', roughness: 0.22, metalness: 0.92, clearcoat: 0.65 },
  silver: { color: '#d4d8df', roughness: 0.2, metalness: 0.94, clearcoat: 0.65 },
};

export function IdCardMesh() {
  const { gl, invalidate } = useThree();
  const frontLayer = useStudioStore((s) => s.layers.front);
  const backLayer = useStudioStore((s) => s.layers.back);
  const activeTemplate = useStudioStore((s) => s.activeTemplate);
  const cardFinish = useStudioStore((s) => s.cardFinish);
  const edgePreset = useStudioStore((s) => s.edgePreset);
  const hologramEnabled = useStudioStore((s) => s.hologramEnabled);
  const hologramIntensity = useStudioStore((s) => s.hologramIntensity);
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);

  // Procedural CR80 geometry & matching hologram overlay geometry
  const cardGeometry = useMemo(() => createCardGeometry(), []);
  const hologramGeometry = useMemo(() => createHologramOverlayGeometry(), []);
  const hologramMaterial = useMemo(() => createHologramMaterial(0.72), []);

  // Dedicated offscreen canvases & CanvasTextures (allocated once, updated strictly on revision change)
  const { frontCanvas, backCanvas, frontTexture, backTexture } = useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();

    const fCanvas = document.createElement('canvas');
    fCanvas.width = LAYER_DIMENSIONS.front.width;
    fCanvas.height = LAYER_DIMENSIONS.front.height;

    const bCanvas = document.createElement('canvas');
    bCanvas.width = LAYER_DIMENSIONS.back.width;
    bCanvas.height = LAYER_DIMENSIONS.back.height;

    // Initial procedural paint so frame 0 already has crisp art
    const store = useStudioStore.getState();
    renderLayerToCanvas(fCanvas, 'front', store.layers.front, store.activeTemplate, null);
    renderLayerToCanvas(bCanvas, 'back', store.layers.back, store.activeTemplate, null);

    return {
      frontCanvas: fCanvas,
      backCanvas: bCanvas,
      frontTexture: createConfiguredCanvasTexture(fCanvas, 'front', maxAniso),
      backTexture: createConfiguredCanvasTexture(bCanvas, 'back', maxAniso),
    };
  }, [gl]);

  // 3-slot PBR materials array matching geometry groups [0: Front, 1: Back, 2: PVC Edge]
  const materials = useMemo(() => {
    const frontMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: frontTexture,
      roughness: 0.14,
      metalness: 0.02,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      ior: 1.52,
      envMapIntensity: 1.0,
    });

    const backMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: backTexture,
      roughness: 0.14,
      metalness: 0.02,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      ior: 1.52,
      envMapIntensity: 1.0,
    });

    const edgeMat = new THREE.MeshPhysicalMaterial({
      color: '#141417',
      roughness: 0.28,
      metalness: 0.06,
      clearcoat: 0.5,
      ior: 1.52,
      envMapIntensity: 1.1,
    });

    return [frontMat, backMat, edgeMat] as const;
  }, [frontTexture, backTexture]);

  // Dispose GPU resources cleanly on unmount
  useEffect(() => {
    return () => {
      cardGeometry.dispose();
      hologramGeometry.dispose();
      hologramMaterial.dispose();
      frontTexture.dispose();
      backTexture.dispose();
      materials.forEach((m) => m.dispose());
    };
  }, [cardGeometry, hologramGeometry, hologramMaterial, frontTexture, backTexture, materials]);

  // Cache loaded HTMLImageElements so slider drags never re-decode data URLs
  const frontImgCache = useRef<{ url: string | null; img: HTMLImageElement | null }>({
    url: null,
    img: null,
  });
  const backImgCache = useRef<{ url: string | null; img: HTMLImageElement | null }>({
    url: null,
    img: null,
  });

  // Compile Front texture only when front layer properties or template change
  useEffect(() => {
    let cancelled = false;
    const compile = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      renderLayerToCanvas(frontCanvas, 'front', frontLayer, activeTemplate, img);
      frontTexture.needsUpdate = true;
      invalidate();
    };

    if (!frontLayer.uploadedImageUrl) {
      frontImgCache.current = { url: null, img: null };
      compile(null);
      return;
    }

    if (frontImgCache.current.url === frontLayer.uploadedImageUrl && frontImgCache.current.img) {
      compile(frontImgCache.current.img);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      frontImgCache.current = { url: frontLayer.uploadedImageUrl, img };
      compile(img);
    };
    img.src = frontLayer.uploadedImageUrl;

    return () => {
      cancelled = true;
    };
  }, [frontCanvas, frontTexture, frontLayer, activeTemplate, invalidate]);

  // Compile Back texture only when back layer properties or template change
  useEffect(() => {
    let cancelled = false;
    const compile = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      renderLayerToCanvas(backCanvas, 'back', backLayer, activeTemplate, img);
      backTexture.needsUpdate = true;
      invalidate();
    };

    if (!backLayer.uploadedImageUrl) {
      backImgCache.current = { url: null, img: null };
      compile(null);
      return;
    }

    if (backImgCache.current.url === backLayer.uploadedImageUrl && backImgCache.current.img) {
      compile(backImgCache.current.img);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      backImgCache.current = { url: backLayer.uploadedImageUrl, img };
      compile(img);
    };
    img.src = backLayer.uploadedImageUrl;

    return () => {
      cancelled = true;
    };
  }, [backCanvas, backTexture, backLayer, activeTemplate, invalidate]);

  // Update glossy vs matte PVC finish
  useEffect(() => {
    const isGlossy = cardFinish === 'glossy';
    for (let i = 0; i < 2; i++) {
      const m = materials[i];
      m.roughness = isGlossy ? 0.14 : 0.58;
      m.metalness = 0.02;
      m.clearcoat = isGlossy ? 0.9 : 0.15;
      m.clearcoatRoughness = isGlossy ? 0.1 : 0.45;
      m.ior = 1.52;
      m.needsUpdate = true;
    }
    invalidate();
  }, [cardFinish, materials, invalidate]);

  // Update PVC core edge material
  useEffect(() => {
    const cfg = EDGE_MATERIAL_CONFIGS[edgePreset];
    const edgeMat = materials[2];
    edgeMat.color.set(cfg.color);
    edgeMat.roughness = cfg.roughness;
    edgeMat.metalness = cfg.metalness;
    edgeMat.clearcoat = cfg.clearcoat;
    edgeMat.needsUpdate = true;
    invalidate();
  }, [edgePreset, materials, invalidate]);

  // Update hologram intensity uniform
  useEffect(() => {
    hologramMaterial.uniforms.uIntensity.value = hologramIntensity;
    invalidate();
  }, [hologramIntensity, hologramMaterial, invalidate]);

  // Subtle deterministic time evolution for hologram micro-shimmer
  useFrame(({ clock }) => {
    if (hologramEnabled) {
      hologramMaterial.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  // Offset card mesh so its slot punch (y = +3.78 cm in local card coordinates) aligns
  // strictly with the parent clasp hinge pivot at (0, 0, 0).
  const offsetY = -CARD_SPECS.slotCenterY;
  const hologramZ = CARD_SPECS.thickness / 2 + 0.002;

  return (
    <group position={[0, offsetY, 0]} name="id-card-group">
      <mesh
        geometry={cardGeometry}
        material={materials as unknown as THREE.Material[]}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="cr80-id-card"
      />
      {hologramEnabled && (
        <mesh
          geometry={hologramGeometry}
          material={hologramMaterial}
          position={[0, 0, hologramZ]}
          renderOrder={2}
          name="hologram-overlay"
        />
      )}
    </group>
  );
}
