import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  PLACEMENT_SPECS,
  TORSO_PROFILES,
  createCoatHangerGeometries,
  createEspressoCupGeometries,
  createRoundedSlabGeometry,
  createTorsoBustGeometry,
  type PlacementSceneId,
} from '../../geometry/placementGeometry';
import {
  createDeskMatMaps,
  createLinenFabricMaps,
  loadWalnutWoodPbrMaps,
} from '../../materials/PlacementTextures';
import { useStudioStore } from '../../store/useStudioStore';

function TablePlacementEnv({ highFidelityShadows }: { highFidelityShadows: boolean }) {
  const { gl, invalidate } = useThree();
  const maxAniso = gl.capabilities.getMaxAnisotropy();

  const resources = useMemo(() => {
    const walnutMaps = loadWalnutWoodPbrMaps('dark-walnut', maxAniso, 2.2, 1.5, invalidate);
    const matMaps = createDeskMatMaps(maxAniso, 4.0, 3.0);

    const deskGeo = createRoundedSlabGeometry(
      PLACEMENT_SPECS.table.deskWidth,
      PLACEMENT_SPECS.table.deskDepth,
      PLACEMENT_SPECS.table.deskThickness,
      1.6,
      0.18
    );
    const matGeo = createRoundedSlabGeometry(
      PLACEMENT_SPECS.table.matWidth,
      PLACEMENT_SPECS.table.matDepth,
      0.15,
      1.4,
      0.04
    );
    const laptopBaseGeo = createRoundedSlabGeometry(26, 19, 0.85, 0.9, 0.12);
    const espresso = createEspressoCupGeometries();

    const deskMat = new THREE.MeshPhysicalMaterial({
      color: '#e8ddd2',
      map: walnutMaps.map,
      normalMap: walnutMaps.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: walnutMaps.roughnessMap,
      roughness: 0.72,
      metalness: 0.02,
      clearcoat: 0.14,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.75,
    });

    const feltMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: matMaps.map,
      bumpMap: matMaps.bumpMap,
      bumpScale: 0.05,
      roughnessMap: matMaps.roughnessMap,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });

    const aluminumMat = new THREE.MeshPhysicalMaterial({
      color: '#cfd5df',
      metalness: 0.88,
      roughness: 0.26,
      anisotropy: 0.6,
      clearcoat: 0.15,
      envMapIntensity: 1.25,
    });

    const darkKeyDeckMat = new THREE.MeshStandardMaterial({
      color: '#181b22',
      roughness: 0.72,
      metalness: 0.12,
    });

    const screenGlassMat = new THREE.MeshPhysicalMaterial({
      color: '#0c1018',
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.4,
    });

    const ceramicMat = new THREE.MeshPhysicalMaterial({
      color: '#ebe7df',
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.0,
    });

    const coffeeMat = new THREE.MeshPhysicalMaterial({
      color: '#2b160c',
      roughness: 0.14,
      metalness: 0.0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    });

    const penBodyMat = new THREE.MeshStandardMaterial({
      color: '#1b1e26',
      roughness: 0.42,
      metalness: 0.35,
    });

    const brassAccentMat = new THREE.MeshPhysicalMaterial({
      color: '#d8b464',
      metalness: 0.9,
      roughness: 0.24,
      anisotropy: 0.7,
    });

    const underTrimMat = new THREE.MeshStandardMaterial({
      color: '#16181f',
      roughness: 0.8,
      metalness: 0.15,
    });

    return {
      walnutMaps,
      matMaps,
      deskGeo,
      matGeo,
      laptopBaseGeo,
      espresso,
      deskMat,
      feltMat,
      aluminumMat,
      darkKeyDeckMat,
      screenGlassMat,
      ceramicMat,
      coffeeMat,
      penBodyMat,
      brassAccentMat,
      underTrimMat,
    };
  }, [maxAniso, invalidate]);

  useEffect(() => {
    return () => {
      resources.walnutMaps.dispose();
      resources.matMaps.dispose();
      resources.deskGeo.dispose();
      resources.matGeo.dispose();
      resources.laptopBaseGeo.dispose();
      resources.espresso.dispose();
      resources.deskMat.dispose();
      resources.feltMat.dispose();
      resources.aluminumMat.dispose();
      resources.darkKeyDeckMat.dispose();
      resources.screenGlassMat.dispose();
      resources.ceramicMat.dispose();
      resources.coffeeMat.dispose();
      resources.penBodyMat.dispose();
      resources.brassAccentMat.dispose();
      resources.underTrimMat.dispose();
    };
  }, [resources]);

  return (
    <group name="placement-env-table">
      {/* Architectural Walnut Desk Top (top surface flush at y = 0.00 cm) */}
      <mesh
        geometry={resources.deskGeo}
        material={resources.deskMat}
        position={[0, -PLACEMENT_SPECS.table.deskThickness, -6.5]}
        receiveShadow={highFidelityShadows}
      />

      {/* Recessed Shadow Apron Under Desk Slab */}
      <mesh
        material={resources.underTrimMat}
        position={[0, -PLACEMENT_SPECS.table.deskThickness - 0.7, -6.5]}
      >
        <boxGeometry args={[72, 1.4, 50]} />
      </mesh>

      {/* Anthracite Wool-Felt Desk Mat (bottom at y = 0.01, top flush at y = 0.16 cm) */}
      <mesh
        geometry={resources.matGeo}
        material={resources.feltMat}
        position={[-1.0, 0.01, -4.5]}
        receiveShadow={highFidelityShadows}
      />

      {/* Composite Minimalist Aluminum Laptop Corner (Upper-Left Scale Reference — shared footprint with tests) */}
      <group
        position={[PLACEMENT_SPECS.table.laptop.x, 0.02, PLACEMENT_SPECS.table.laptop.z]}
        rotation={[0, PLACEMENT_SPECS.table.laptop.yaw, 0]}
      >
        <mesh
          geometry={resources.laptopBaseGeo}
          material={resources.aluminumMat}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh material={resources.darkKeyDeckMat} position={[0, 0.87, -2.1]}>
          <boxGeometry args={[21.5, 0.06, 9.2]} />
        </mesh>
        <mesh material={resources.aluminumMat} position={[0, 0.87, 5.2]}>
          <boxGeometry args={[8.4, 0.04, 5.4]} />
        </mesh>
        {/* Hinged Open Display Lid (tilts cleanly UPWARD & BACKWARD at 106°) */}
        <group position={[0, 0.82, -9.2]} rotation={[-0.28, 0, 0]}>
          <mesh
            material={resources.aluminumMat}
            position={[0, 8.8, -0.18]}
            castShadow={highFidelityShadows}
          >
            <boxGeometry args={[25.8, 17.6, 0.36]} />
          </mesh>
          <mesh material={resources.screenGlassMat} position={[0, 8.8, 0.02]}>
            <boxGeometry args={[24.6, 16.4, 0.06]} />
          </mesh>
        </group>
      </group>

      {/* Composite Ceramic Espresso Cup & Saucer (Upper-Right Editorial Prop) */}
      <group
        position={[PLACEMENT_SPECS.table.espresso.x, 0.02, PLACEMENT_SPECS.table.espresso.z]}
        rotation={[0, -0.82, 0]}
      >
        <mesh
          geometry={resources.espresso.saucer}
          material={resources.ceramicMat}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh
          geometry={resources.espresso.cup}
          material={resources.ceramicMat}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh
          geometry={resources.espresso.handle}
          material={resources.ceramicMat}
          castShadow={highFidelityShadows}
        />
        <mesh
          geometry={resources.espresso.coffeeSurface}
          material={resources.coffeeMat}
        />
      </group>

      {/* Composite Machined Matte-Black Studio Pen Resting on Desk Mat */}
      <group position={[13.2, 0.56, 7.6]} rotation={[0, -0.38, 0]}>
        {/* Main Matte Barrel */}
        <mesh
          material={resources.penBodyMat}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow={highFidelityShadows}
        >
          <cylinderGeometry args={[0.38, 0.38, 12.2, 18]} />
        </mesh>
        {/* Brass Accent Ring */}
        <mesh
          material={resources.brassAccentMat}
          position={[0, 0, 4.4]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.41, 0.41, 0.45, 18]} />
        </mesh>
        {/* Tapered Metallic Nib */}
        <mesh
          material={resources.aluminumMat}
          position={[0, 0, 7.1]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow={highFidelityShadows}
        >
          <coneGeometry args={[0.38, 2.0, 18]} />
        </mesh>
        {/* Top Click Cap */}
        <mesh
          material={resources.brassAccentMat}
          position={[0, 0, -6.4]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.32, 0.36, 0.7, 16]} />
        </mesh>
        {/* Slim Pocket Clip */}
        <mesh material={resources.brassAccentMat} position={[0, 0.45, -3.5]}>
          <boxGeometry args={[0.14, 0.12, 4.4]} />
        </mesh>
      </group>
    </group>
  );
}

function TorsoPlacementEnv({ highFidelityShadows }: { highFidelityShadows: boolean }) {
  const { gl, invalidate } = useThree();
  const maxAniso = gl.capabilities.getMaxAnisotropy();

  const resources = useMemo(() => {
    const linenMaps = createLinenFabricMaps(maxAniso, 6, 6);
    const walnutMaps = loadWalnutWoodPbrMaps('cathedral-walnut', maxAniso, 1.5, 1.2, invalidate);
    const bustGeo = createTorsoBustGeometry();

    const linenMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: linenMaps.map,
      bumpMap: linenMaps.bumpMap,
      bumpScale: 0.08,
      roughnessMap: linenMaps.roughnessMap,
      roughness: 0.92,
      metalness: 0.0,
      sheen: 0.32,
      sheenRoughness: 0.85,
      sheenColor: new THREE.Color('#94a3b8'),
      envMapIntensity: 0.42,
    });

    const walnutMat = new THREE.MeshPhysicalMaterial({
      color: '#f0e6dc',
      map: walnutMaps.map,
      normalMap: walnutMaps.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: walnutMaps.roughnessMap,
      roughness: 0.54,
      metalness: 0.03,
      clearcoat: 0.28,
      clearcoatRoughness: 0.28,
    });

    const steelMat = new THREE.MeshPhysicalMaterial({
      color: '#cfd6e0',
      metalness: 0.9,
      roughness: 0.24,
      anisotropy: 0.75,
      envMapIntensity: 1.25,
    });

    const brassMat = new THREE.MeshPhysicalMaterial({
      color: '#dfb868',
      metalness: 0.92,
      roughness: 0.22,
      anisotropy: 0.75,
    });

    const baseIronMat = new THREE.MeshStandardMaterial({
      color: '#1b1e25',
      roughness: 0.52,
      metalness: 0.65,
    });

    return {
      linenMaps,
      walnutMaps,
      bustGeo,
      linenMat,
      walnutMat,
      steelMat,
      brassMat,
      baseIronMat,
    };
  }, [maxAniso, invalidate]);

  useEffect(() => {
    return () => {
      resources.linenMaps.dispose();
      resources.walnutMaps.dispose();
      resources.bustGeo.dispose();
      resources.linenMat.dispose();
      resources.walnutMat.dispose();
      resources.steelMat.dispose();
      resources.brassMat.dispose();
      resources.baseIronMat.dispose();
    };
  }, [resources]);

  const topProf = TORSO_PROFILES[TORSO_PROFILES.length - 1];
  const baseProf = TORSO_PROFILES[0];
  const postHeight = baseProf.y - PLACEMENT_SPECS.torso.standFloorY;

  return (
    <group name="placement-env-torso">
      {/* Primary Silhouette: Sculpted Heather Charcoal Tailor's Linen Torso Bust */}
      <mesh
        geometry={resources.bustGeo}
        material={resources.linenMat}
        castShadow={highFidelityShadows}
        receiveShadow={highFidelityShadows}
      />

      {/* Turned Walnut & Brass Tailor's Neck Finial Cap (seated cleanly at neck rim) */}
      <group position={[0, topProf.y, topProf.centerZ]}>
        {/* Slim Brass Collar Trim Ring flush with linen neck top */}
        <mesh material={resources.brassMat} position={[0, 0.08, 0]}>
          <cylinderGeometry args={[5.88, 5.88, 0.24, 36]} />
        </mesh>
        <mesh
          material={resources.walnutMat}
          position={[0, 0.72, 0]}
          castShadow={highFidelityShadows}
        >
          <cylinderGeometry args={[5.45, 5.85, 1.05, 36]} />
        </mesh>
        <mesh material={resources.brassMat} position={[0, 1.44, 0]}>
          <cylinderGeometry args={[2.0, 2.55, 0.42, 24]} />
        </mesh>
        <mesh
          material={resources.walnutMat}
          position={[0, 2.48, 0]}
          castShadow={highFidelityShadows}
        >
          <sphereGeometry args={[1.55, 24, 18]} />
        </mesh>
      </group>

      {/* Turned Walnut Base Cap Under Waist */}
      <mesh
        material={resources.walnutMat}
        position={[0, baseProf.y - 0.6, baseProf.centerZ]}
        scale={[1.0, 1.0, 0.53]}
      >
        <cylinderGeometry args={[baseProf.rx * 0.98, baseProf.rx * 0.94, 1.2, 36]} />
      </mesh>

      {/* Brushed-Steel Telescoping Mannequin Stand Post & Brass Collar */}
      <group position={[0, 0, baseProf.centerZ]}>
        <mesh
          material={resources.brassMat}
          position={[0, baseProf.y - 2.2, 0]}
          castShadow={highFidelityShadows}
        >
          <cylinderGeometry args={[2.1, 1.8, 2.4, 24]} />
        </mesh>
        <mesh
          material={resources.steelMat}
          position={[0, PLACEMENT_SPECS.torso.standFloorY + postHeight / 2, 0]}
          castShadow={highFidelityShadows}
        >
          <cylinderGeometry args={[1.15, 1.28, postHeight, 20]} />
        </mesh>
        <mesh material={resources.brassMat} position={[0, baseProf.y - 9.5, 0]}>
          <cylinderGeometry args={[1.65, 1.65, 1.4, 24]} />
        </mesh>
        {/* Heavy Matte-Iron Pedestal Floor Disc */}
        <mesh
          material={resources.baseIronMat}
          position={[0, PLACEMENT_SPECS.torso.standFloorY + 0.65, 0]}
          receiveShadow={highFidelityShadows}
        >
          <cylinderGeometry args={[13.5, 14.5, 1.3, 36]} />
        </mesh>
      </group>
    </group>
  );
}

function HangerPlacementEnv({ highFidelityShadows }: { highFidelityShadows: boolean }) {
  const { gl, invalidate } = useThree();
  const maxAniso = gl.capabilities.getMaxAnisotropy();

  const resources = useMemo(() => {
    const walnutMaps = loadWalnutWoodPbrMaps('dark-walnut', maxAniso, 1.8, 1.0, invalidate);
    const hanger = createCoatHangerGeometries();

    const walnutMat = new THREE.MeshPhysicalMaterial({
      color: '#f0e4d8',
      map: walnutMaps.map,
      normalMap: walnutMaps.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: walnutMaps.roughnessMap,
      roughness: 0.52,
      metalness: 0.03,
      clearcoat: 0.32,
      clearcoatRoughness: 0.26,
      envMapIntensity: 0.85,
    });

    const steelMat = new THREE.MeshPhysicalMaterial({
      color: '#dce2ec',
      metalness: 0.92,
      roughness: 0.22,
      anisotropy: 0.82,
      envMapIntensity: 1.3,
    });

    const brassMat = new THREE.MeshPhysicalMaterial({
      color: '#e0bc6c',
      metalness: 0.92,
      roughness: 0.22,
      anisotropy: 0.8,
    });

    const rackFrameMat = new THREE.MeshPhysicalMaterial({
      color: '#252932',
      metalness: 0.78,
      roughness: 0.36,
      envMapIntensity: 1.05,
    });

    return { walnutMaps, hanger, walnutMat, steelMat, brassMat, rackFrameMat };
  }, [maxAniso, invalidate]);

  useEffect(() => {
    return () => {
      resources.walnutMaps.dispose();
      resources.hanger.dispose();
      resources.walnutMat.dispose();
      resources.steelMat.dispose();
      resources.brassMat.dispose();
      resources.rackFrameMat.dispose();
    };
  }, [resources]);

  const { railY, railRadius, rackHalfWidthX, rackFloorY, trouserBarY, shoulderSpanHalfX } =
    PLACEMENT_SPECS.hanger;
  const uprightHeight = railY - rackFloorY;

  return (
    <group name="placement-env-hanger">
      {/* Composite Sculpted Walnut Coat Hanger */}
      <group name="sculpted-coat-hanger">
        <mesh
          geometry={resources.hanger.woodBody}
          material={resources.walnutMat}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        <mesh
          geometry={resources.hanger.steelHook}
          material={resources.steelMat}
          castShadow={highFidelityShadows}
        />
        <mesh
          geometry={resources.hanger.ferruleCollar}
          material={resources.brassMat}
          castShadow={highFidelityShadows}
        />
        <mesh
          geometry={resources.hanger.trouserBar}
          material={resources.walnutMat}
          castShadow={highFidelityShadows}
          receiveShadow={highFidelityShadows}
        />
        {/* Twin Brass Trouser-Bar End Ferrules */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            material={resources.brassMat}
            position={[side * (shoulderSpanHalfX - 3.1), trouserBarY, 0.45]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.56, 0.56, 1.1, 16]} />
          </mesh>
        ))}
      </group>

      {/* Open-Back Minimalist Boutique Garment Rail (zero occlusion for 360° orbit!) */}
      <group name="boutique-garment-rack">
        {/* Horizontal Brushed-Steel Crossbar */}
        <mesh
          material={resources.steelMat}
          position={[0, railY, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow={highFidelityShadows}
        >
          <cylinderGeometry args={[railRadius, railRadius, rackHalfWidthX * 2 + 4.5, 24]} />
        </mesh>

        {/* Twin Side Uprights, Brass Corner Couplers, End Caps & Grounded Floor Foot Bars */}
        {[-1, 1].map((side) => (
          <group key={side}>
            {/* Rail End-Cap Stopper */}
            <mesh
              material={resources.brassMat}
              position={[side * (rackHalfWidthX + 2.4), railY, 0]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[railRadius * 1.18, railRadius * 1.18, 0.85, 20]} />
            </mesh>
            {/* Corner T-Coupler Collar */}
            <mesh material={resources.brassMat} position={[side * rackHalfWidthX, railY, 0]}>
              <sphereGeometry args={[1.45, 20, 16]} />
            </mesh>
            {/* Slim Matte-Steel Vertical Upright Post */}
            <mesh
              material={resources.rackFrameMat}
              position={[side * rackHalfWidthX, rackFloorY + uprightHeight / 2, 0]}
              castShadow={highFidelityShadows}
            >
              <cylinderGeometry args={[0.92, 0.92, uprightHeight, 18]} />
            </mesh>
            {/* Weighted Ground Foot Bar */}
            <mesh
              material={resources.rackFrameMat}
              position={[side * rackHalfWidthX, rackFloorY + 0.6, 0]}
              receiveShadow={highFidelityShadows}
            >
              <boxGeometry args={[2.6, 1.2, 22.0]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Renders the active real-world placement simulation environment (`table`, `torso`, or `hanger`).
 * Returns null in default `'studio'` mode.
 */
export function PlacementEnvironments({ placement }: { placement: PlacementSceneId }) {
  const highFidelityShadows = useStudioStore((s) => s.performanceTier.highFidelityShadows);

  if (placement === 'table') {
    return <TablePlacementEnv highFidelityShadows={highFidelityShadows} />;
  }
  if (placement === 'torso') {
    return <TorsoPlacementEnv highFidelityShadows={highFidelityShadows} />;
  }
  if (placement === 'hanger') {
    return <HangerPlacementEnv highFidelityShadows={highFidelityShadows} />;
  }
  return null;
}
