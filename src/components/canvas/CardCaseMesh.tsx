import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { CARD_SPECS } from '../../geometry/cardGeometry';
import {
  createCardCaseGeometries,
  disposeCardCaseGeometries,
} from '../../geometry/caseGeometry';
import { useStudioStore, type CardCaseStyle } from '../../store/useStudioStore';

const CASE_STYLE_CONFIGS: Record<
  CardCaseStyle,
  {
    color: string;
    roughness: number;
    metalness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    opacity: number;
    transparent: boolean;
  }
> = {
  'matte-obsidian': {
    color: '#1b1e26',
    roughness: 0.42,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    opacity: 1.0,
    transparent: false,
  },
  'frosted-clear': {
    color: '#dce6f5',
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
    opacity: 0.56,
    transparent: true,
  },
  'glacier-white': {
    color: '#f1f5f9',
    roughness: 0.34,
    metalness: 0.04,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    opacity: 1.0,
    transparent: false,
  },
  'slate-aluminum': {
    color: '#b8c2d1',
    roughness: 0.26,
    metalness: 0.88,
    clearcoat: 0.3,
    clearcoatRoughness: 0.18,
    opacity: 1.0,
    transparent: false,
  },
  'cobalt-frame': {
    color: '#1d4ed8',
    roughness: 0.32,
    metalness: 0.08,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
    opacity: 1.0,
    transparent: false,
  },
};

/**
 * Rigid 3D Protective Badge Case / Holder wrapping the vertical CR80 card.
 * Positioned in the card pendulum frame so its molded top slot punch aligns
 * directly with the swivel lobster clasp hook at world y = +3.78 cm.
 */
export function CardCaseMesh() {
  const { invalidate } = useThree();
  const cardCaseStyle = useStudioStore((s) => s.cardCaseStyle);
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);

  const geos = useMemo(() => createCardCaseGeometries(), []);

  const frameMaterial = useMemo(() => {
    const cfg = CASE_STYLE_CONFIGS['matte-obsidian'];
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      clearcoat: cfg.clearcoat,
      clearcoatRoughness: cfg.clearcoatRoughness,
      opacity: cfg.opacity,
      transparent: cfg.transparent,
      ior: 1.52,
      envMapIntensity: 1.15,
    });
  }, []);

  // Crystal-clear protective acrylic front/back window lens (catches subtle studio glints without dulling art)
  const lensMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.06,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.49,
      opacity: 0.11,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    });
  }, []);

  useEffect(() => {
    return () => {
      disposeCardCaseGeometries(geos);
      frameMaterial.dispose();
      lensMaterial.dispose();
    };
  }, [geos, frameMaterial, lensMaterial]);

  useEffect(() => {
    const cfg = CASE_STYLE_CONFIGS[cardCaseStyle];
    frameMaterial.color.set(cfg.color);
    frameMaterial.roughness = cfg.roughness;
    frameMaterial.metalness = cfg.metalness;
    frameMaterial.clearcoat = cfg.clearcoat;
    frameMaterial.clearcoatRoughness = cfg.clearcoatRoughness;
    frameMaterial.opacity = cfg.opacity;
    frameMaterial.transparent = cfg.transparent;
    frameMaterial.depthWrite = !cfg.transparent;
    frameMaterial.needsUpdate = true;
    invalidate();
  }, [cardCaseStyle, frameMaterial, invalidate]);

  // Offset by -slotCenterY so header slot punch sits at local (0, 0, 0) = clasp hook saddle
  const offsetY = -CARD_SPECS.slotCenterY;
  const lensZ = 0.088;

  return (
    <group position={[0, offsetY, 0]} name="card-protective-case-group">
      <mesh
        geometry={geos.caseFrame}
        material={frameMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="card-case-frame"
      />
      <mesh
        geometry={geos.caseHeaderTab}
        material={frameMaterial}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
        name="card-case-header-tab"
      />
      {/* Front & back clear polycarbonate protective window panes */}
      <mesh
        geometry={geos.caseWindowLens}
        material={lensMaterial}
        position={[0, 0, lensZ]}
        renderOrder={3}
        name="card-case-front-lens"
      />
      <mesh
        geometry={geos.caseWindowLens}
        material={lensMaterial}
        position={[0, 0, -lensZ]}
        renderOrder={3}
        name="card-case-back-lens"
      />
    </group>
  );
}
