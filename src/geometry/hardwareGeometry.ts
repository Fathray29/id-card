import * as THREE from 'three';

export interface HardwareGeometries {
  /** Upper fixed hardware attached to the lanyard strap */
  crimpClamp: THREE.BufferGeometry;
  crimpCollar: THREE.BufferGeometry;
  swivelRing: THREE.BufferGeometry;
  swivelBarrel: THREE.BufferGeometry;
  /** Lower swivel lobster clasp assembly — rotates WITH the card around the swivel axis */
  claspBody: THREE.BufferGeometry;
  claspThumbTrigger: THREE.BufferGeometry;
  claspHookLoop: THREE.BufferGeometry;
}

/**
 * Exact mechanical heights (world units = cm):
 *   - Card top edge:        y = 4.28 cm
 *   - Card slot punch:      y in [3.63, 3.93] cm (center 3.78 cm, width 1.40 cm)
 *   - Card PVC thickness:   z in [-0.046, +0.046] cm (30 mil + bevel)
 *   - Hook wire radius:     0.068 cm -> saddle center at y = 3.855 cm so top of wire
 *                           rests at y = 3.923 cm (0.07 mm under slot top 3.93 cm)
 *                           giving snug gravity-seated contact with zero air gap & zero clipping!
 *   - Swivel bearing seam:  y = 5.06 cm (clasp neck mates cleanly inside swivel barrel base)
 */
export const HARDWARE_SPECS = {
  swivelAxisY: 5.06,
  hookSaddleY: 3.855,
  hookWireRadius: 0.068,
} as const;

export function createHardwareGeometries(): HardwareGeometries {
  // 1. Trapezoidal Crimp Clamp (2.28 cm outer housing wrapping 2.0 cm overlapping straps, y = 6.12..7.22 cm)
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
  crimpClamp.translate(0, 6.67, 0);
  crimpClamp.computeVertexNormals();

  // Horizontal crimped grip collar at clamp base (y = 6.12 cm)
  const crimpCollar = new THREE.CylinderGeometry(0.18, 0.18, 1.08, 20);
  crimpCollar.rotateZ(Math.PI / 2);
  crimpCollar.scale(1, 1, 1.15);
  crimpCollar.translate(0, 6.12, 0);

  // 2. Swivel Oval D-Ring (connects clamp collar at y=6.10 down to swivel barrel top at y=5.56)
  const ringCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.42, 6.10, 0),
      new THREE.Vector3(0.42, 6.10, 0),
      new THREE.Vector3(0.47, 5.84, 0),
      new THREE.Vector3(0.24, 5.58, 0),
      new THREE.Vector3(0.0, 5.54, 0),
      new THREE.Vector3(-0.24, 5.58, 0),
      new THREE.Vector3(-0.47, 5.84, 0),
    ],
    true
  );
  const swivelRing = new THREE.TubeGeometry(ringCurve, 40, 0.088, 14, true);

  // Turned Swivel Barrel (LatheGeometry y = 5.02..5.64 cm with machined bearing collar)
  const barrelProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.23, 0.0),
    new THREE.Vector2(0.26, 0.08),
    new THREE.Vector2(0.26, 0.25),
    new THREE.Vector2(0.19, 0.30),
    new THREE.Vector2(0.19, 0.43),
    new THREE.Vector2(0.25, 0.49),
    new THREE.Vector2(0.25, 0.58),
    new THREE.Vector2(0.15, 0.62),
    new THREE.Vector2(0.0, 0.62),
  ];
  const swivelBarrel = new THREE.LatheGeometry(barrelProfile, 24);
  swivelBarrel.translate(0, 5.02, 0);

  // 3. Lower Swivel Lobster Clasp Housing (seamless machined stem from barrel base y=5.08 down to y=4.38 cm)
  // Leaves exact 0.10 cm clearance above the card top edge (y=4.28 cm) and joins solidly into swivelBarrel!
  const claspProfile = [
    new THREE.Vector2(0.0, 0.0), // Bottom latch nose at y = 4.38
    new THREE.Vector2(0.12, 0.04),
    new THREE.Vector2(0.17, 0.16),
    new THREE.Vector2(0.19, 0.36),
    new THREE.Vector2(0.17, 0.54),
    new THREE.Vector2(0.14, 0.66),
    new THREE.Vector2(0.16, 0.72), // Mates directly inside swivelBarrel bottom socket (y = 5.10)
    new THREE.Vector2(0.0, 0.72),
  ];
  const claspBody = new THREE.LatheGeometry(claspProfile, 22);
  claspBody.scale(1.05, 1.0, 0.92);
  claspBody.translate(0, 4.38, 0);

  // Integrated Spring-Gate Thumb Tab (mounted flush against the side-front of the clasp body, zero air gap)
  const claspThumbTrigger = new THREE.CapsuleGeometry(0.055, 0.18, 6, 12);
  claspThumbTrigger.rotateZ(-Math.PI / 3.4);
  claspThumbTrigger.translate(0.18, 4.62, 0.06);

  // 4. Snug, Gravity-Seated Lobster Claw Hook Loop in the YZ plane:
  //    - Anchors directly inside claspBody at y = 4.56 cm (z = +/- 0.06 cm)
  //    - Wraps closely around the 0.092 cm thick top PVC bridge (y = 3.93..4.28 cm) at z = +/- 0.145 cm
  //      (inner wire wall at z = +/- 0.077 cm -> crisp 0.3 mm physical clearance on both front & back faces)
  //    - Passes straight through the slot punch at y = 3.855 cm so top of 0.068 cm radius wire sits at
  //      y = 3.923 cm — cradling the card's upper slot rim (y = 3.93 cm) with zero floating gap!
  const hookCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 4.56, 0.05),
      new THREE.Vector3(0, 4.42, 0.145),
      new THREE.Vector3(0, 4.14, 0.155),
      new THREE.Vector3(0, 3.92, 0.12),
      new THREE.Vector3(0, HARDWARE_SPECS.hookSaddleY, 0.0), // Seated right under slot top rim (3.93 cm)
      new THREE.Vector3(0, 3.92, -0.12),
      new THREE.Vector3(0, 4.14, -0.155),
      new THREE.Vector3(0, 4.42, -0.145),
      new THREE.Vector3(0, 4.56, -0.05),
    ],
    true
  );
  const claspHookLoop = new THREE.TubeGeometry(
    hookCurve,
    48,
    HARDWARE_SPECS.hookWireRadius,
    14,
    true
  );

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
