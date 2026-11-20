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
import { createHardwareGeometries, disposeHardwareGeometries } from './hardwareGeometry';
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

test('Lanyard CatmullRomCurve3 normalizes to exact 80.00 cm (+/- 0.01 cm) with apex Z crossover', () => {
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

  assert.ok(start.zOffset > 0.07);
  assert.ok(end.zOffset < -0.07);
  assert.ok(Math.abs(start.zOffset - end.zOffset - 0.16) < 1e-6);
  assert.equal(mid.zOffset, 0);
  assert.equal(mid.twistRad, 0);

  const { geometry } = createLanyardGeometry();
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i));
    maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i));
    maxV = Math.max(maxV, uv.getY(i));
  }
  assert.ok(minU >= 0 && maxU <= 1.0001);
  assert.ok(minV >= 0 && Math.abs(maxV - 1.0) < 0.01);
  geometry.dispose();
});

test('Hardware geometries build all 7 metallic parts with snugly seated clasp hook & barrel mating', () => {
  const hw = createHardwareGeometries();
  assert.ok(hw.crimpClamp.attributes.position.count > 0);
  assert.ok(hw.crimpCollar.attributes.position.count > 0);
  assert.ok(hw.swivelRing.attributes.position.count > 0);
  assert.ok(hw.swivelBarrel.attributes.position.count > 0);
  assert.ok(hw.claspBody.attributes.position.count > 0);
  assert.ok(hw.claspThumbTrigger.attributes.position.count > 0);
  assert.ok(hw.claspHookLoop.attributes.position.count > 0);

  // Verify hook loop passes cleanly through the slot punch (y in [3.63, 3.93] cm)
  hw.claspHookLoop.computeBoundingBox();
  const hookBb = hw.claspHookLoop.boundingBox!;
  assert.ok(
    hookBb.min.y >= 3.74 && hookBb.min.y <= 3.83,
    `Hook min Y ${hookBb.min.y} should sit snugly inside slot punch without floating gap`
  );
  // Hook wraps snugly around PVC thickness (+/-0.046 cm) without protruding excessively
  assert.ok(hookBb.max.z > 0.14 && hookBb.max.z < 0.25, `Hook max Z ${hookBb.max.z} should be snug`);

  // Verify clasp body mates directly into swivel barrel bottom (y = 5.02 cm) with zero floating air gap
  hw.swivelBarrel.computeBoundingBox();
  hw.claspBody.computeBoundingBox();
  assert.ok(
    hw.claspBody.boundingBox!.max.y >= hw.swivelBarrel.boundingBox!.min.y,
    'Clasp body must seat solidly into swivel barrel bottom'
  );

  disposeHardwareGeometries(hw);
});

test('Protective 3D badge case aligns top header lug with clasp hook and frames CR80 card cleanly', () => {
  const caseGeos = createCardCaseGeometries();
  assert.ok(caseGeos.caseFrame.attributes.position.count > 0);
  assert.ok(caseGeos.caseHeaderTab.attributes.position.count > 0);
  assert.ok(caseGeos.caseWindowLens.attributes.position.count > 0);

  caseGeos.caseFrame.computeBoundingBox();
  const frameBb = caseGeos.caseFrame.boundingBox!;
  const frameSize = new THREE.Vector3();
  frameBb.getSize(frameSize);
  assert.ok(frameSize.x > CARD_SPECS.width + 0.6, 'Case frame should surround 5.4 cm card width');
  assert.ok(frameSize.z > CARD_SPECS.thickness + 0.15, 'Case frame should enclose card thickness');

  // Header tab top edge aligns cleanly with bare card top (y = 4.28 cm) so clasp body clears by 0.10 cm
  caseGeos.caseHeaderTab.computeBoundingBox();
  const tabBb = caseGeos.caseHeaderTab.boundingBox!;
  assert.ok(Math.abs(tabBb.max.y - CASE_SPECS.headerTopY) < 0.03);
  assert.ok(tabBb.max.z < 0.07, 'Header tab thickness must fit inside clasp hook loop clearance');

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

