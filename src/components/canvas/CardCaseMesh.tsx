import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { CARD_SPECS } from '../../geometry/cardGeometry';
import {
  createCardCaseGeometries,
  disposeCardCaseGeometries,
} from '../../geometry/caseGeometry';
import { useStudioStore, type CardCaseStyle } from '../../store/useStudioStore';

interface CaseStyleVisuals {
  color: string;
  detailColor: string;
  roughness: number;
  detailRoughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  opacity: number;
  detailOpacity: number;
  backPlateOpacity: number;
  transparent: boolean;
  envMapIntensity: number;
}

const CASE_STYLE_CONFIGS: Record<CardCaseStyle, CaseStyleVisuals> = {
  'frosted-clear': {
    // Crystal-clear glossy injection-molded polycarbonate matching the reference ID holder
    color: '#f2f7ff',
    detailColor: '#f8fbff',
    roughness: 0.05,
    detailRoughness: 0.08,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    opacity: 0.25,
    detailOpacity: 0.36,
    backPlateOpacity: 0.11,
    transparent: true,
    envMapIntensity: 2.0,
  },
  'matte-obsidian': {
    color: '#1b1e26',
    detailColor: '#252933',
    roughness: 0.42,
    detailRoughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    opacity: 1.0,
    detailOpacity: 1.0,
    backPlateOpacity: 1.0,
    transparent: false,
    envMapIntensity: 1.15,
  },
  'glacier-white': {
    color: '#f1f5f9',
    detailColor: '#ffffff',
    roughness: 0.32,
    detailRoughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.58,
    clearcoatRoughness: 0.2,
    opacity: 1.0,
    detailOpacity: 1.0,
    backPlateOpacity: 1.0,
    transparent: false,
    envMapIntensity: 1.15,
  },
  'slate-aluminum': {
    color: '#b8c2d1',
    detailColor: '#cfd8e6',
    roughness: 0.26,
    detailRoughness: 0.22,
    metalness: 0.88,
    clearcoat: 0.3,
    clearcoatRoughness: 0.18,
    opacity: 1.0,
    detailOpacity: 1.0,
    backPlateOpacity: 1.0,
    transparent: false,
    envMapIntensity: 1.35,
  },
  'cobalt-frame': {
    color: '#1d4ed8',
    detailColor: '#2563eb',
    roughness: 0.32,
    detailRoughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
    opacity: 1.0,
    detailOpacity: 1.0,
    backPlateOpacity: 1.0,
    transparent: false,
    envMapIntensity: 1.2,
  },
};

/**
 * Rigid 3D Protective Badge Case / Holder wrapping the vertical CR80 card.
 * Features the full-width arched 3-hole dome header, raised top card-stop rib,
 * stepped side grip rails, 4 molded corner rings, and rear rounded-shield thumb-push cutout.
 * Positioned in the card pendulum frame so its center header slot punch aligns
 * directly with the swivel lobster clasp hook at world y = +3.78 cm.
 */
export function CardCaseMesh() {
  const { invalidate } = useThree();
  const cardCaseStyle = useStudioStore((s) => s.cardCaseStyle);
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);

  const geos = useMemo(() => createCardCaseGeometries(), []);

  const frameMaterial = useMemo(() => {
    const cfg = CASE_STYLE_CONFIGS['frosted-clear'];
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      clearcoat: cfg.clearcoat,
      clearcoatRoughness: cfg.clearcoatRoughness,
      opacity: cfg.opacity,
      transparent: cfg.transparent,
      depthWrite: !cfg.transparent,
      ior: 1.54,
      reflectivity: 0.9,
      envMapIntensity: cfg.envMapIntensity,
    });
  }, []);

  // Slightly crisper, slightly higher-opacity optical material for raised molded rails, stop-rib, and thumb rim
  const detailMaterial = useMemo(() => {
    const cfg = CASE_STYLE_CONFIGS['frosted-clear'];
    return new THREE.MeshPhysicalMaterial({
      color: cfg.detailColor,
      roughness: cfg.detailRoughness,
      metalness: cfg.metalness,
      clearcoat: cfg.clearcoat,
      clearcoatRoughness: cfg.clearcoatRoughness,
      opacity: cfg.detailOpacity,
      transparent: cfg.transparent,
      depthWrite: !cfg.transparent,
      ior: 1.54,
      reflectivity: 0.95,
      envMapIntensity: cfg.envMapIntensity + 0.15,
    });
  }, []);

  // Back plate with rounded-shield thumb-push cutout (clear polycarbonate in clear mode, solid shell in opaque styles)
  const backPlateMaterial = useMemo(() => {
    const cfg = CASE_STYLE_CONFIGS['frosted-clear'];
    return new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      roughness: cfg.transparent ? 0.06 : cfg.roughness,
      metalness: cfg.metalness,
      clearcoat: cfg.transparent ? 1.0 : cfg.clearcoat,
      clearcoatRoughness: cfg.transparent ? 0.04 : cfg.clearcoatRoughness,
      opacity: cfg.backPlateOpacity,
      transparent: cfg.transparent,
      depthWrite: !cfg.transparent,
      ior: 1.54,
      envMapIntensity: cfg.transparent ? 1.55 : cfg.envMapIntensity,
      side: THREE.DoubleSide,
    });
  }, []);

  // Crystal-clear front protective optical polycarbonate lens (subtle studio glints without dulling artwork)
  const lensMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      ior: 1.54,
      opacity: 0.10,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 1.45,
      side: THREE.DoubleSide,
    });
  }, []);

  useEffect(() => {
    return () => {
      disposeCardCaseGeometries(geos);
      frameMaterial.dispose();
      detailMaterial.dispose();
      backPlateMaterial.dispose();
      lensMaterial.dispose();
    };
  }, [geos, frameMaterial, detailMaterial, backPlateMaterial, lensMaterial]);

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
    frameMaterial.envMapIntensity = cfg.envMapIntensity;
    frameMaterial.needsUpdate = true;

    detailMaterial.color.set(cfg.detailColor);
    detailMaterial.roughness = cfg.detailRoughness;
    detailMaterial.metalness = cfg.metalness;
    detailMaterial.clearcoat = cfg.clearcoat;
    detailMaterial.clearcoatRoughness = cfg.clearcoatRoughness;
    detailMaterial.opacity = cfg.detailOpacity;
    detailMaterial.transparent = cfg.transparent;
    detailMaterial.depthWrite = !cfg.transparent;
    detailMaterial.envMapIntensity = cfg.envMapIntensity + 0.15;
    detailMaterial.needsUpdate = true;

    backPlateMaterial.color.set(cfg.color);
    backPlateMaterial.roughness = cfg.transparent ? 0.06 : cfg.roughness;
    backPlateMaterial.metalness = cfg.metalness;
    backPlateMaterial.clearcoat = cfg.transparent ? 1.0 : cfg.clearcoat;
    backPlateMaterial.clearcoatRoughness = cfg.transparent ? 0.04 : cfg.clearcoatRoughness;
    backPlateMaterial.opacity = cfg.backPlateOpacity;
    backPlateMaterial.transparent = cfg.transparent;
    backPlateMaterial.depthWrite = !cfg.transparent;
    backPlateMaterial.envMapIntensity = cfg.transparent ? 1.55 : cfg.envMapIntensity;
    backPlateMaterial.needsUpdate = true;

    invalidate();
  }, [cardCaseStyle, frameMaterial, detailMaterial, backPlateMaterial, invalidate]);

  // Offset by -slotCenterY so center header slot punch sits at local (0, 0, 0) = clasp hook saddle
  const offsetY = -CARD_SPECS.slotCenterY;
  const isClear = cardCaseStyle === 'frosted-clear';

  return (
    <group position={[0, offsetY, 0]} name="card-protective-case-group">
      <mesh
        geometry={geos.caseFrame}
        material={frameMaterial}
        castShadow={highFidelityShadows && !isClear}
        receiveShadow={highFidelityShadows}
        renderOrder={isClear ? 4 : 1}
        name="card-case-frame"
      />
      <mesh
        geometry={geos.caseHeaderTab}
        material={frameMaterial}
        castShadow={highFidelityShadows && !isClear}
        receiveShadow={highFidelityShadows}
        renderOrder={isClear ? 4 : 1}
        name="card-case-header-tab"
      />
      <mesh
        geometry={geos.caseMoldedDetails}
        material={detailMaterial}
        castShadow={highFidelityShadows && !isClear}
        receiveShadow={highFidelityShadows}
        renderOrder={isClear ? 5 : 1}
        name="card-case-molded-details"
      />
      {/* Rigid rear face with authentic rounded-shield thumb-push cutout */}
      <mesh
        geometry={geos.caseBackPlate}
        material={backPlateMaterial}
        castShadow={highFidelityShadows && !isClear}
        receiveShadow={highFidelityShadows}
        renderOrder={isClear ? 3 : 1}
        name="card-case-back-plate"
      />
      {/* Front crystal-clear optical polycarbonate window pane */}
      <mesh
        geometry={geos.caseWindowLens}
        material={lensMaterial}
        renderOrder={3}
        name="card-case-front-lens"
      />
    </group>
  );
}
