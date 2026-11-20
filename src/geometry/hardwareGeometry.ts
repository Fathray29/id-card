import * as THREE from 'three';

export interface HardwareGeometries {
  crimpClamp: THREE.BufferGeometry;
  crimpCollar: THREE.BufferGeometry;
  swivelRing: THREE.BufferGeometry;
  swivelBarrel: THREE.BufferGeometry;
  claspBody: THREE.BufferGeometry;
  claspThumbTrigger: THREE.BufferGeometry;
  claspHookLoop: THREE.BufferGeometry;
}

/**
 * Builds multi-part brushed steel/chrome attachment hardware connecting the
 * lanyard bottom apex (y ≈ 6.75 cm) down through the CR80 slot punch (y = 3.78 cm)
 * with zero PVC mesh intersection.
 *
 * Vertical assembly breakdown (1 unit = 1 cm):
 *   1. Trapezoidal Crimp Clamp: width 2.1 cm, height 1.1 cm (y = 6.10 .. 7.20 cm)
 *   2. Swivel D-Ring & Barrel:  y = 5.20 .. 6.15 cm
 *   3. Lobster Claw Hook:       y = 3.70 .. 5.25 cm, wire loop passes cleanly
 *                               through the 1.4 x 0.3 cm slot punch at y = 3.78 cm
 */
export function createHardwareGeometries(): HardwareGeometries {
  // 1. Trapezoidal Crimp Clamp (2.25 cm outer housing wrapping 2.0 cm overlapping straps, height 1.1 cm)
  const crimpShape = new THREE.Shape();
  crimpShape.moveTo(-1.14, 0.55);
  crimpShape.lineTo(1.14, 0.55);
  crimpShape.quadraticCurveTo(1.17, 0.35, 0.94, -0.05);
  crimpShape.lineTo(0.58, -0.55);
  crimpShape.lineTo(-0.58, -0.55);
  crimpShape.lineTo(-0.94, -0.05);
  crimpShape.quadraticCurveTo(-1.17, 0.35, -1.14, 0.55);
  crimpShape.closePath();

  const crimpClamp = new THREE.ExtrudeGeometry(crimpShape, {
    depth: 0.62,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
    curveSegments: 16,
  });
  crimpClamp.translate(0, 0, -0.31);
  crimpClamp.translate(0, 6.65, 0);
  crimpClamp.computeVertexNormals();

  // Horizontal crimped grip rib across clamp base
  const crimpCollar = new THREE.CylinderGeometry(0.18, 0.18, 1.06, 20);
  crimpCollar.rotateZ(Math.PI / 2);
  crimpCollar.scale(1, 1, 1.15);
  crimpCollar.translate(0, 6.1, 0);

  // 2. Swivel Oval D-Ring (connects clamp eyelet to swivel barrel)
  const ringCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.42, 6.08, 0),
      new THREE.Vector3(0.42, 6.08, 0),
      new THREE.Vector3(0.48, 5.82, 0),
      new THREE.Vector3(0.24, 5.58, 0),
      new THREE.Vector3(0.0, 5.54, 0),
      new THREE.Vector3(-0.24, 5.58, 0),
      new THREE.Vector3(-0.48, 5.82, 0),
    ],
    true
  );
  const swivelRing = new THREE.TubeGeometry(ringCurve, 40, 0.09, 14, true);

  // Turned Swivel Barrel (LatheGeometry with machined bevel ridges)
  const barrelProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.0),
    new THREE.Vector2(0.25, 0.08),
    new THREE.Vector2(0.25, 0.24),
    new THREE.Vector2(0.19, 0.29),
    new THREE.Vector2(0.19, 0.42),
    new THREE.Vector2(0.24, 0.48),
    new THREE.Vector2(0.24, 0.58),
    new THREE.Vector2(0.14, 0.62),
    new THREE.Vector2(0.0, 0.62),
  ];
  const swivelBarrel = new THREE.LatheGeometry(barrelProfile, 24);
  swivelBarrel.translate(0, 4.98, 0);

  // 3. Lobster Claw Body (compact machined housing above card top edge y = 4.28 cm)
  const claspBody = new THREE.CapsuleGeometry(0.16, 0.36, 8, 18);
  claspBody.scale(1.15, 1.0, 0.85);
  claspBody.translate(0, 4.72, 0);

  // Thumb trigger lever protruding cleanly from side of lobster clasp
  const claspThumbTrigger = new THREE.CapsuleGeometry(0.065, 0.22, 6, 12);
  claspThumbTrigger.rotateZ(-Math.PI / 3.2);
  claspThumbTrigger.translate(0.26, 4.62, 0);

  // Lobster Claw Hook Loop passing cleanly through the 1.4 x 0.3 cm card slot punch at y = 3.78 cm!
  // Card top edge is at y = 4.28 cm, slot punch opening is y in [3.63, 3.93] cm, PVC z in [-0.038, +0.038] cm.
  // The hook curves front-to-back in the YZ plane so it passes straight through (x=0, y=3.78, z=0)
  // and clears the top PVC bridge (y=3.93..4.28) at z = +/- 0.20 cm with zero intersection!
  const hookCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 4.62, 0.04),
      new THREE.Vector3(0, 4.44, 0.24),
      new THREE.Vector3(0, 4.10, 0.25),
      new THREE.Vector3(0, 3.80, 0.14),
      new THREE.Vector3(0, 3.76, 0.0), // Passes cleanly through center of slot punch (y = 3.78 cm)
      new THREE.Vector3(0, 3.80, -0.14),
      new THREE.Vector3(0, 4.10, -0.25),
      new THREE.Vector3(0, 4.44, -0.24),
      new THREE.Vector3(0, 4.62, -0.04),
    ],
    true
  );
  // Wire radius 0.075 cm (diameter 0.15 cm) fits effortlessly inside the 0.30 cm slot punch height!
  const claspHookLoop = new THREE.TubeGeometry(hookCurve, 44, 0.075, 14, true);

  return {
    crimpClamp,
    crimpCollar,
    swivelRing,
    swivelBarrel,
    claspBody,
    claspThumbTrigger,
    claspHookLoop,
  };
}

export function disposeHardwareGeometries(geos: HardwareGeometries): void {
  geos.crimpClamp.dispose();
  geos.crimpCollar.dispose();
  geos.swivelRing.dispose();
  geos.swivelBarrel.dispose();
  geos.claspBody.dispose();
  geos.claspThumbTrigger.dispose();
  geos.claspHookLoop.dispose();
}
