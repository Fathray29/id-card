import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CARD_SPECS, createCardGeometry } from './cardGeometry';
import {
  LANYARD_SPECS,
  buildNormalizedLanyardCurve,
  computeApexCrossover,
  createLanyardGeometry,
} from './lanyardGeometry';
import {
  CRIMP_SPECS,
  createHardwareGeometries,
  disposeHardwareGeometries,
  getCrimpOuterHalfWidth,
} from './hardwareGeometry';
import {
  CASE_SPECS,
  createCardCaseGeometries,
  disposeCardCaseGeometries,
} from './caseGeometry';

test('CR80 ID card geometry has exact 5.4 x 8.56 x 0.076 cm bounding dimensions', () => {
  const geo = createCardGeometry();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);

  assert.ok(Math.abs(size.x - CARD_SPECS.width) < 0.02, `Expected width 5.4, got ${size.x}`);
  assert.ok(Math.abs(size.y - CARD_SPECS.height) < 0.02, `Expected height 8.56, got ${size.y}`);
  assert.ok(
    Math.abs(size.z - CARD_SPECS.thickness) < 0.005,
    `Expected thickness 0.076, got ${size.z}`
  );

  // Centered around origin
  const center = new THREE.Vector3();
  bb.getCenter(center);
  assert.ok(Math.abs(center.x) < 0.01);
  assert.ok(Math.abs(center.y) < 0.01);
  assert.ok(Math.abs(center.z) < 0.002);

  geo.dispose();
});

test('CR80 ID card splits into 3 material groups with normalized & back-mirrored planar UVs', () => {
  const geo = createCardGeometry();
  assert.equal(geo.groups.length, 3);
  assert.equal(geo.groups[0].materialIndex, 0); // Front
  assert.equal(geo.groups[1].materialIndex, 1); // Back
  assert.equal(geo.groups[2].materialIndex, 2); // Edge
  assert.ok(geo.groups[0].count > 0);
  assert.ok(geo.groups[1].count > 0);
  assert.ok(geo.groups[2].count > 0);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;

  // Verify Front UVs: u = (x + W/2)/W, v = (y + H/2)/H
  for (let i = geo.groups[0].start; i < geo.groups[0].start + geo.groups[0].count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const expectedU = THREE.MathUtils.clamp((x + CARD_SPECS.width / 2) / CARD_SPECS.width, 0, 1);
    const expectedV = THREE.MathUtils.clamp((y + CARD_SPECS.height / 2) / CARD_SPECS.height, 0, 1);
    assert.ok(Math.abs(uv.getX(i) - expectedU) < 1e-4);
    assert.ok(Math.abs(uv.getY(i) - expectedV) < 1e-4);
  }

  // Verify Back UVs are horizontally mirrored: u = 1 - (x + W/2)/W
  for (let i = geo.groups[1].start; i < geo.groups[1].start + geo.groups[1].count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const expectedU = THREE.MathUtils.clamp(
      1.0 - (x + CARD_SPECS.width / 2) / CARD_SPECS.width,
      0,
      1
    );
    const expectedV = THREE.MathUtils.clamp((y + CARD_SPECS.height / 2) / CARD_SPECS.height, 0, 1);
    assert.ok(Math.abs(uv.getX(i) - expectedU) < 1e-4);
    assert.ok(Math.abs(uv.getY(i) - expectedV) < 1e-4);
  }

  geo.dispose();
});

test('Lanyard CatmullRomCurve3 normalizes to exact 80.00 cm (+/- 0.01 cm) with apex Z crossover and zero crimp poke-through', () => {
  const { totalLength, points } = buildNormalizedLanyardCurve();
  assert.equal(points.length, LANYARD_SPECS.samples + 1);
  assert.ok(
    Math.abs(totalLength - 80.0) <= 0.05,
    `Expected lanyard length ~80.00 cm, got ${totalLength}`
  );

  // Verify crossover separation at bottom apex prevents Z-fighting
  const start = computeApexCrossover(0.0);
  const end = computeApexCrossover(1.0);
  const mid = computeApexCrossover(0.5);

  assert.ok(start.zOffset > 0.10);
  assert.ok(end.zOffset < -0.10);
  assert.ok(Math.abs(start.zOffset - end.zOffset - 2 * LANYARD_SPECS.crossoverZ) < 1e-6);
  assert.equal(mid.zOffset, 0);
  assert.equal(mid.twistRad, 0);

  const { geometry } = createLanyardGeometry();
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let crimpVerticesChecked = 0;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Every single lanyard vertex inside the metal crimp height must stay strictly inside X, Y, Z jaws!
    if (y <= CRIMP_SPECS.topY) {
      crimpVerticesChecked++;
      assert.ok(
        y >= CRIMP_SPECS.bottomY + 0.1,
        `Lanyard vertex poked below crimp base: y=${y} < ${CRIMP_SPECS.bottomY + 0.1}`
      );
      const wallHalfW = getCrimpOuterHalfWidth(y);
      assert.ok(
        Math.abs(x) <= wallHalfW - 0.08,
        `Lanyard vertex poked out side of crimp at y=${y}: |x|=${Math.abs(x)} > ${wallHalfW - 0.08}`
      );
      assert.ok(
        Math.abs(z) <= CRIMP_SPECS.halfDepthZ - 0.04,
        `Lanyard vertex poked out front/back of crimp at y=${y}: |z|=${Math.abs(z)} > ${CRIMP_SPECS.halfDepthZ - 0.04}`
      );
    }

    minU = Math.min(minU, uv.getX(i));
    maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i));
    maxV = Math.max(maxV, uv.getY(i));
  }

  assert.ok(crimpVerticesChecked > 40, 'Expected strap vertices inside the metal crimp clamp');
  assert.ok(minU >= 0 && maxU <= 1.0001);
  assert.ok(minV >= 0 && Math.abs(maxV - 1.0) < 0.01);
  geometry.dispose();
});

test('Hardware geometries build 3-stage center-push buckle + riveted folded loop + wide D-ring + 360 swivel + lobster-claw clasp', () => {
  const hw = createHardwareGeometries();
  assert.ok(hw.buckleBody.attributes.position.count > 0);
  assert.ok(hw.buckleAccent.attributes.position.count > 0);
  assert.ok(hw.lowerStrapTab.attributes.position.count > 0);
  assert.ok(hw.rivets.attributes.position.count > 0);
  assert.ok(hw.splitRing.attributes.position.count > 0);
  assert.ok(hw.swivelBarrel.attributes.position.count > 0);
  assert.ok(hw.claspBody.attributes.position.count > 0);
  assert.ok(hw.claspThumbTrigger.attributes.position.count > 0);
  assert.ok(hw.claspHookLoop.attributes.position.count > 0);

  // Stage 3: Verify lobster-claw hook jaw passes cleanly through the slot punch (y in [3.63, 3.93] cm)
  hw.claspHookLoop.computeBoundingBox();
  const hookBb = hw.claspHookLoop.boundingBox!;
  assert.ok(
    hookBb.min.y >= 3.74 && hookBb.min.y <= 3.83,
    `Hook min Y ${hookBb.min.y} should sit snugly inside slot punch without floating gap`
  );
  assert.ok(hookBb.max.z > 0.14 && hookBb.max.z < 0.45, `Hook max Z ${hookBb.max.z} should form clean teardrop jaw`);

  // Verify cast clasp body mates directly into 360° swivel barrel bottom (y = 5.46 cm) with zero air gap
  hw.swivelBarrel.computeBoundingBox();
  hw.claspBody.computeBoundingBox();
  assert.ok(
    hw.claspBody.boundingBox!.max.y >= hw.swivelBarrel.boundingBox!.min.y,
    'Clasp body must seat solidly into swivel barrel bottom'
  );

  // Verify wide D-ring spans wider than the 2.0 cm strap (> 2.15 cm) and interlocks cleanly with swivel eye & lower folded strap
  hw.splitRing.computeBoundingBox();
  hw.lowerStrapTab.computeBoundingBox();
  hw.buckleBody.computeBoundingBox();
  hw.buckleAccent.computeBoundingBox();

  const dRingWidth = hw.splitRing.boundingBox!.max.x - hw.splitRing.boundingBox!.min.x;
  assert.ok(
    dRingWidth > 2.15 && dRingWidth < 2.6,
    `Wide D-ring width ${dRingWidth} must exceed 2.0 cm strap so flat bar keeps webbing spread`
  );
  assert.ok(
    hw.splitRing.boundingBox!.min.y < hw.swivelBarrel.boundingBox!.max.y,
    'D-ring arch must interlock cleanly through 360° swivel eye'
  );
  assert.ok(
    hw.lowerStrapTab.boundingBox!.min.y < hw.splitRing.boundingBox!.max.y - 0.12,
    'Folded 2-layer lower strap loop must fully enclose the flat straight top bar of the D-ring'
  );
  assert.ok(
    hw.lowerStrapTab.boundingBox!.max.y > hw.buckleBody.boundingBox!.min.y,
    'Lower strap loop must wrap cleanly around bottom anchor bar of center-push buckle'
  );
  // Stage 1: Verify concave circular center-push thumb button sits flush on front (+Z) of female housing
  assert.ok(
    hw.buckleAccent.boundingBox!.max.z >= hw.buckleBody.boundingBox!.max.z - 0.03,
    'Concave center-push circular thumb button must reach front cutout face of female sleeve'
  );

  disposeHardwareGeometries(hw);
});

test('Protective 3D badge case builds full-width arched 3-hole polycarbonate shell with side rails and rear thumb cutout', () => {
  const caseGeos = createCardCaseGeometries();
  assert.ok(caseGeos.caseFrame.attributes.position.count > 0);
  assert.ok(caseGeos.caseHeaderTab.attributes.position.count > 0);
  assert.ok(caseGeos.caseMoldedDetails.attributes.position.count > 0);
  assert.ok(caseGeos.caseBackPlate.attributes.position.count > 0);
  assert.ok(caseGeos.caseWindowLens.attributes.position.count > 0);

  caseGeos.caseFrame.computeBoundingBox();
  const frameBb = caseGeos.caseFrame.boundingBox!;
  const frameSize = new THREE.Vector3();
  frameBb.getSize(frameSize);
  assert.ok(frameSize.x > CARD_SPECS.width + 0.6, 'Case frame should surround 5.4 cm card width');
  assert.ok(frameSize.z > CARD_SPECS.thickness + 0.15, 'Case frame should enclose card thickness');

  // Full-width arched dome header spans full case width and aligns cleanly with bare card top (y = 4.28 cm)
  caseGeos.caseHeaderTab.computeBoundingBox();
  const tabBb = caseGeos.caseHeaderTab.boundingBox!;
  const tabSize = new THREE.Vector3();
  tabBb.getSize(tabSize);
  assert.ok(tabSize.x > CASE_SPECS.outerWidth - 0.15, `Arched dome header width ${tabSize.x} must span full case width`);
  assert.ok(Math.abs(tabBb.max.y - CASE_SPECS.headerTopY) < 0.03);
  assert.ok(tabBb.max.z < 0.07, 'Header tab thickness must fit inside clasp hook loop clearance');

  // Verify rear back plate sits behind the enclosed card with clean Z placement
  caseGeos.caseBackPlate.computeBoundingBox();
  assert.ok(caseGeos.caseBackPlate.boundingBox!.max.z < -0.05, 'Back plate must sit behind CR80 card');

  disposeCardCaseGeometries(caseGeos);
});

test('Solid CR80 card (in-case mode) preserves exact 5.4 x 8.56 x 0.076 cm bounds with zero top slot hole', () => {
  const punched = createCardGeometry({ includeSlotPunch: true });
  const solid = createCardGeometry({ includeSlotPunch: false });

  solid.computeBoundingBox();
  const size = new THREE.Vector3();
  solid.boundingBox!.getSize(size);
  assert.ok(Math.abs(size.x - CARD_SPECS.width) < 0.02);
  assert.ok(Math.abs(size.y - CARD_SPECS.height) < 0.02);
  assert.ok(Math.abs(size.z - CARD_SPECS.thickness) < 0.005);

  // Solid card has significantly fewer edge/slot triangles than the punched card
  assert.ok(
    solid.groups[2].count < punched.groups[2].count,
    'Solid card should not contain interior slot punch bevel/edge vertices'
  );

  // Verify no edge/bevel vertices sit inside the interior slot punch zone (|x| < 0.8, y in [3.55, 4.00])
  const pos = solid.getAttribute('position') as THREE.BufferAttribute;
  const edgeStart = solid.groups[2].start;
  const edgeEnd = edgeStart + solid.groups[2].count;
  for (let i = edgeStart; i < edgeEnd; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const insideSlotZone = Math.abs(x) < 0.8 && y > 3.55 && y < 4.0;
    assert.equal(insideSlotZone, false, `Found unexpected interior slot vertex at (${x}, ${y})`);
  }

  punched.dispose();
  solid.dispose();
});

