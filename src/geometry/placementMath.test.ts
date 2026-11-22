import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LANYARD_SPECS,
  buildNormalizedLanyardCurve,
  computeApexCrossover,
  createLanyardGeometry,
} from './lanyardGeometry';
import {
  PLACEMENT_SPECS,
  computeTorsoSignedClearance,
  createCoatHangerGeometries,
  createTorsoBustGeometry,
  getAssemblyTransformForPlacement,
  getHangerWoodTopY,
  getPlacementCameraPose,
  isPointInsideTableLaptopFootprint,
  type PlacementSceneId,
} from './placementGeometry';
import { CARD_SPECS } from './cardGeometry';
import { CASE_SPECS } from './caseGeometry';
import { CRIMP_SPECS } from './hardwareGeometry';
import {
  createInitialSpringState,
  stepOfflinePresetFrame,
  type AnimationPreset,
} from '../utils/physicsEngine';

const ALL_PLACEMENTS: PlacementSceneId[] = ['studio', 'table', 'torso', 'hanger'];

test('all 4 placement lanyard splines normalize closely to 80.0 cm and produce valid finite BufferGeometry', () => {
  for (const mode of ALL_PLACEMENTS) {
    const { totalLength, points } = buildNormalizedLanyardCurve(mode);
    assert.ok(
      Math.abs(totalLength - 80.0) < 0.85,
      `${mode} lanyard length ${totalLength.toFixed(3)} cm should stay within +/- 0.85 cm of 80 cm`
    );
    assert.equal(points.length, 321);

    const { geometry } = createLanyardGeometry(mode);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    assert.ok(pos.count > 1000, `${mode} lanyard should have dense vertices`);
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getX(i)), `${mode} X finite`);
      assert.ok(Number.isFinite(pos.getY(i)), `${mode} Y finite`);
      assert.ok(Number.isFinite(pos.getZ(i)), `${mode} Z finite`);
    }
    geometry.dispose();
  }
});

test('table placement rests ID card & lanyard flat on the desk mat and NEVER clips the laptop or espresso cup', () => {
  const bareXform = getAssemblyTransformForPlacement('table', false);
  const caseXform = getAssemblyTransformForPlacement('table', true);

  // Front face points UP (+Y) after -PI/2 X rotation with zero Y-roll (yaw MUST be on Z in XYZ Euler order)
  assert.equal(bareXform.rotation[0], -Math.PI / 2);
  assert.equal(bareXform.rotation[1], 0);
  assert.equal(bareXform.swayScale, 0);
  assert.ok(
    bareXform.position[1] - CARD_SPECS.thickness / 2 > PLACEMENT_SPECS.table.matTopY,
    'Bare card bottom face must rest cleanly above desk mat top'
  );
  assert.ok(
    caseXform.position[1] - CASE_SPECS.frameDepth / 2 > PLACEMENT_SPECS.table.matTopY,
    'Cased card bottom face must rest cleanly above desk mat top'
  );

  // Every lanyard spine point transformed into world space must sit strictly above the desk mat
  // AND completely clear of both the laptop chassis and the espresso saucer!
  const { points } = buildNormalizedLanyardCurve('table');
  const euler = new THREE.Euler(...bareXform.rotation, 'XYZ');
  const offset = new THREE.Vector3(...bareXform.position);
  const espresso = PLACEMENT_SPECS.table.espresso;

  for (let i = 1; i < points.length - 1; i++) {
    assert.ok(
      points[i].z >= 0.049,
      `Table lanyard point ${i} z=${points[i].z} must stay above desk mat`
    );
    const worldPt = points[i].clone().applyEuler(euler).add(offset);
    assert.ok(
      worldPt.y > PLACEMENT_SPECS.table.matTopY + 0.05,
      `Table lanyard world point ${i} y=${worldPt.y.toFixed(3)} must stay strictly above desk mat (${PLACEMENT_SPECS.table.matTopY})`
    );
    assert.equal(
      isPointInsideTableLaptopFootprint(worldPt.x, worldPt.z, 1.5),
      false,
      `Table lanyard world point ${i} (${worldPt.x.toFixed(2)}, ${worldPt.z.toFixed(2)}) must NOT clip into laptop footprint`
    );
    const distToEspresso = Math.hypot(worldPt.x - espresso.x, worldPt.z - espresso.z);
    assert.ok(
      distToEspresso > espresso.saucerRadius + 1.2,
      `Table lanyard world point ${i} dist to espresso (${distToEspresso.toFixed(2)} cm) must stay clear of saucer (${espresso.saucerRadius} cm)`
    );
  }
});

test('torso placement drapes naturally with ZERO clipping across EVERY single ribbon vertex', () => {
  const bustGeo = createTorsoBustGeometry();
  assert.ok(bustGeo.boundingBox !== null);
  bustGeo.dispose();

  const { points } = buildNormalizedLanyardCurve('torso');
  let minSpineClearance = Infinity;
  let maxUpperSpineClearance = -Infinity;

  for (const pt of points) {
    const c = computeTorsoSignedClearance(pt);
    if (c < minSpineClearance) minSpineClearance = c;
    if (pt.y >= CRIMP_SPECS.topY + 2.2 && c > maxUpperSpineClearance) {
      maxUpperSpineClearance = c;
    }
  }

  assert.ok(
    minSpineClearance >= 0.04,
    `Torso lanyard spine minimum clearance (${minSpineClearance.toFixed(3)} cm) must not clip inside bust`
  );
  assert.ok(
    maxUpperSpineClearance <= 0.55,
    `Torso lanyard spine maximum clearance (${maxUpperSpineClearance.toFixed(3)} cm) must drape naturally without floating`
  );

  // Strict per-vertex test on the FULL 2.0 cm wide beveled 3D ribbon mesh (all outer edges & back face!)
  const { geometry } = createLanyardGeometry('torso');
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  let minVertexClearance = Infinity;
  let maxUpperVertexClearance = -Infinity;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (v.y <= CRIMP_SPECS.topY + 0.25) continue;
    const c = computeTorsoSignedClearance(v);
    if (c < minVertexClearance) minVertexClearance = c;
    if (v.y >= CRIMP_SPECS.topY + 2.2 && c > maxUpperVertexClearance) maxUpperVertexClearance = c;
  }
  geometry.dispose();

  assert.ok(
    minVertexClearance >= 0.055,
    `Every torso lanyard ribbon vertex must clear bust cleanly (found min=${minVertexClearance.toFixed(4)} cm)`
  );
  assert.ok(
    maxUpperVertexClearance <= 0.72,
    `Torso lanyard ribbon vertices must rest naturally against torso (found max=${maxUpperVertexClearance.toFixed(3)} cm)`
  );

  // Check back face of both bare & cased ID card rests cleanly on front chest without penetrating bust
  const cardBackZ = -CASE_SPECS.frameDepth / 2;
  for (const y of [-4.5, 0, 3.0]) {
    for (const x of [-2.6, 0, 2.6]) {
      const c = computeTorsoSignedClearance(new THREE.Vector3(x, y, cardBackZ));
      assert.ok(
        c > 0.04,
        `Cased card point (${x}, ${y}, ${cardBackZ}) clearance ${c.toFixed(3)} cm must not clip inside chest`
      );
    }
  }
});

test('crimp V-junction front and back lanyard legs stay cleanly separated in Z without slicing', () => {
  // Verify opposing legs right above the crimp exit (t = 0.03 vs t = 0.97)
  const frontLeg = computeApexCrossover(0.03);
  const backLeg = computeApexCrossover(0.97);
  const centerSep = Math.abs(frontLeg.zOffset - backLeg.zOffset);
  const edgeTiltDrop = Math.sin(Math.abs(frontLeg.twistRad)) * (LANYARD_SPECS.strapWidth / 2);
  // Inner faces between the two tilted 2 cm straps must remain strictly positive (zero slicing!)
  const faceGap = centerSep - LANYARD_SPECS.strapThickness - 2 * edgeTiltDrop;
  assert.ok(
    faceGap > 0.03,
    `Crimp exit front/back inner face gap (${faceGap.toFixed(4)} cm) must stay strictly > 0.03 cm to prevent slicing`
  );
});

test('hanger placement seats lanyard snugly over walnut coat hanger crest with clean 3-part wishbone hanger (no floating bar)', () => {
  const hanger = createCoatHangerGeometries();
  assert.ok(hanger.woodBody.boundingBox !== null);
  assert.ok(hanger.steelHook.getAttribute('position').count > 100);
  assert.ok(hanger.ferruleCollar.getAttribute('position').count > 20);
  hanger.dispose();

  const { topY, points } = buildNormalizedLanyardCurve('hanger');
  const crestWoodY = getHangerWoodTopY(0);
  assert.ok(
    topY >= crestWoodY + 0.04 && topY <= crestWoodY + 0.55,
    `Hanger lanyard topY (${topY.toFixed(2)} cm) should sit snugly on walnut crest (${crestWoodY.toFixed(2)} cm) without floating`
  );

  // Verify the front drop hangs smoothly in front of the sculpted walnut neck
  const neckFrontPts = points.filter(
    (p) => Math.abs(p.y - (PLACEMENT_SPECS.hanger.woodBottomY + 1.3)) < 1.2 && p.z > 0
  );
  assert.ok(neckFrontPts.length > 0);
  for (const p of neckFrontPts) {
    assert.ok(
      p.z > PLACEMENT_SPECS.hanger.woodHalfDepthZ + 0.08,
      `Hanger strap at walnut neck y=${p.y.toFixed(2)} should clear front wood cleanly (z=${p.z.toFixed(2)})`
    );
  }
});

test('getPlacementCameraPose returns valid finite poses for all 4 placements x 4 camera presets', () => {
  const presets = ['full', 'front', 'back', 'macro'] as const;
  for (const placement of ALL_PLACEMENTS) {
    for (const preset of presets) {
      const pose = getPlacementCameraPose(placement, preset, {
        isPortrait: false,
        cardCaseEnabled: false,
      });
      for (const v of [...pose.position, ...pose.target]) {
        assert.ok(Number.isFinite(v), `Non-finite camera coord for ${placement}/${preset}`);
      }
      const dist = new THREE.Vector3(...pose.position).distanceTo(new THREE.Vector3(...pose.target));
      assert.ok(dist > 4.0 && dist < 130.0, `Unexpected camera distance ${dist.toFixed(2)} for ${placement}/${preset}`);
    }
  }
});

test('placement-aware offline video choreography produces collision-free finite camera poses across all 4 scenes', () => {
  const initial = createInitialSpringState();
  const presets: AnimationPreset[] = ['cinematic-360', 'cinematic-reel', 'turntable', 'pendulum-flip', 'parallax-sway'];

  for (const placement of ALL_PLACEMENTS) {
    for (const preset of presets) {
      for (let f = 0; f <= 48; f += 4) {
        const st = stepOfflinePresetFrame(initial, preset, f, 48, 24, 16 / 9, placement);
        if (placement !== 'studio' || preset === 'cinematic-360' || preset === 'cinematic-reel') {
          assert.ok(st.cameraPose !== null, `${placement}/${preset} frame ${f} should provide cameraPose`);
          const pos = st.cameraPose.position;
          const tgt = st.cameraPose.target;
          for (const val of [pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, st.cameraPose.fov]) {
            assert.ok(Number.isFinite(val), `Non-finite camera value in ${placement}/${preset} frame ${f}`);
          }
          if (placement === 'table') {
            assert.ok(
              pos.y >= 10.0,
              `Table video camera y=${pos.y.toFixed(2)} must stay strictly above walnut tabletop in ${preset} frame ${f}`
            );
          }
        }
      }
    }
  }
});
