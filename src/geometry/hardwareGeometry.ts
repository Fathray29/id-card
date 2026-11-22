import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface HardwareGeometries {
  /** Stage 1: Black POM/acetal center-push quick-release buckle — female outer sleeve & anchor bars */
  buckleBody: THREE.BufferGeometry;
  /** Stage 1: Male cantilevered insert tongue, side guide ribs & concave circular center-push thumb button */
  buckleAccent: THREE.BufferGeometry;
  /** Stage 2: Folded 2-layer lower strap loop wrapping cleanly around the D-ring straight bar & lower buckle bar */
  lowerStrapTab: THREE.BufferGeometry;
  /** Stage 2: Twin metal double-cap rivets (lower & upper strap loops, front & back) */
  rivets: THREE.BufferGeometry;
  /** Stage 3: Wide metal D-ring (flat top bar enclosed in lower strap loop + curved arch funneling load to swivel) */
  splitRing: THREE.BufferGeometry;
  /** Stage 3: 360-degree rotating barrel swivel collar + interlocking top swivel loop eye */
  swivelBarrel: THREE.BufferGeometry;
  /** Stage 3: Cast spring-loaded lobster-claw clasp body + circular pivot pin + hinged closing gate (rotates with card) */
  claspBody: THREE.BufferGeometry;
  /** Stage 3: Side thumb trigger lever actuating the hinged spring gate */
  claspThumbTrigger: THREE.BufferGeometry;
  /** Stage 3: Solid sculpted lobster-claw hook jaw seated snugly inside card/case slot punch */
  claspHookLoop: THREE.BufferGeometry;
}

/**
 * Exact mechanical coordinates (world units = cm) for the 3-stage detachable quick-release lanyard end-piece:
 *   Stage 3 — Badge Attachment:
 *     - Card/Case slot punch:      y in [3.63, 3.93] cm (center 3.78 cm, width 1.40 cm)
 *     - Lobster-claw hook saddle:  y = 3.855 cm (wire radius 0.066 cm -> top 3.921 cm cradles 3.93 cm slot top)
 *     - Cast clasp body & trigger: y in [4.34, 5.54] cm
 *     - 360° barrel swivel collar: y in [5.46, 6.34] cm (swivel axis at y = 5.56 cm)
 *     - Wide metal D-ring:         y in [6.18, 7.34] cm (flat straight bar at y = 7.28 cm, width 2.24 cm)
 *   Stage 2 — Riveted Load-Transfer Strap Loops:
 *     - Lower folded 2-layer loop: y in [7.14, 8.98] cm (wraps cleanly around D-ring flat bar & lower buckle bar)
 *     - Lower double-cap rivet:    y = 8.08 cm
 *     - Upper double-cap rivet:    y = 12.38 cm
 *   Stage 1 — Black Plastic Center-Push Quick-Release Buckle:
 *     - Female outer socket + open side channels + circular cutout: y in [8.80, 11.68] cm
 *     - Concave circular center-push thumb button (male tongue):    center (0, 10.24 cm), radius 0.78 cm
 */
export const HARDWARE_SPECS = {
  swivelAxisY: 5.56,
  hookSaddleY: 3.855,
  hookWireRadius: 0.066,
  dRingArchBottomY: 6.20,
  dRingFlatBarY: 7.28,
  dRingHalfWidth: 1.12,
  /** Alias preserved for tests/callers */
  splitRingCenterY: 6.74,
  splitRingRadius: 0.62,
  lowerRivetY: 8.08,
  buckleBottomY: 8.80,
  buckleTopY: 11.68,
  buckleCenterDiscY: 10.24,
  upperRivetY: 12.38,
} as const;

/**
 * Upper strap anchor containment envelope inside the center-push buckle's top anchor bar.
 * Exported as CRIMP_SPECS for full compatibility with lanyardGeometry.ts and test suites.
 */
export const CRIMP_SPECS = {
  bottomY: 11.12,
  shoulderY: 11.54,
  topY: 11.74,
  bottomHalfW: 1.05,
  shoulderHalfW: 1.05,
  topHalfW: 1.07,
  halfDepthZ: 0.23,
} as const;

export function getCrimpOuterHalfWidth(y: number): number {
  if (y <= CRIMP_SPECS.bottomY) return CRIMP_SPECS.bottomHalfW;
  if (y >= CRIMP_SPECS.topY) return CRIMP_SPECS.topHalfW;
  if (y >= CRIMP_SPECS.shoulderY) {
    const u = (y - CRIMP_SPECS.shoulderY) / (CRIMP_SPECS.topY - CRIMP_SPECS.shoulderY);
    return CRIMP_SPECS.shoulderHalfW + (CRIMP_SPECS.topHalfW - CRIMP_SPECS.shoulderHalfW) * u;
  }
  const u = (y - CRIMP_SPECS.bottomY) / (CRIMP_SPECS.shoulderY - CRIMP_SPECS.bottomY);
  return CRIMP_SPECS.bottomHalfW + (CRIMP_SPECS.shoulderHalfW - CRIMP_SPECS.bottomHalfW) * u;
}

function normalizeForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

function mergeNormalized(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((p) => normalizeForMerge(p));
  const merged = mergeGeometries(normalized, false);
  for (const p of parts) p.dispose();
  for (const n of normalized) {
    if (!parts.includes(n)) n.dispose();
  }
  if (!merged) {
    throw new Error('Failed to merge hardware BufferGeometries');
  }
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

function createRoundedRectShape(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  radius: number
): THREE.Shape {
  const shape = new THREE.Shape();
  const r = Math.min(radius, (xMax - xMin) / 2, (yMax - yMin) / 2);
  shape.moveTo(xMin + r, yMin);
  shape.lineTo(xMax - r, yMin);
  shape.quadraticCurveTo(xMax, yMin, xMax, yMin + r);
  shape.lineTo(xMax, yMax - r);
  shape.quadraticCurveTo(xMax, yMax, xMax - r, yMax);
  shape.lineTo(xMin + r, yMax);
  shape.quadraticCurveTo(xMin, yMax, xMin, yMax - r);
  shape.lineTo(xMin, yMin + r);
  shape.quadraticCurveTo(xMin, yMin, xMin + r, yMin);
  shape.closePath();
  return shape;
}

/**
 * Smooth, high-resolution domed double-cap metal rivet (LatheGeometry with spherical-cap cosine curve
 * and bottom-to-top winding for strictly outward normals and zero radial faceting).
 */
function createDoubleCapRivet(
  yCenter: number,
  zBase: number,
  zSign: 1 | -1,
  radius = 0.255,
  height = 0.068
): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(radius * 0.96, 0.0),
    new THREE.Vector2(radius, height * 0.16),
  ];
  const domeSteps = 14;
  for (let i = 1; i <= domeSteps; i++) {
    const theta = (i / domeSteps) * (Math.PI / 2);
    const r = radius * Math.cos(theta);
    const h = height * (0.16 + 0.84 * Math.sin(theta));
    profile.push(new THREE.Vector2(Math.max(0, r), h));
  }
  const cap = new THREE.LatheGeometry(profile, 48);
  if (zSign === 1) {
    cap.rotateX(Math.PI / 2);
    cap.translate(0, yCenter, zBase);
  } else {
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, yCenter, -zBase);
  }
  return cap;
}

/**
 * Creates the iconic slightly-concave (dished-in) circular thumb-push button molded onto
 * the male cantilevered tongue, with a crisp 90-degree vertical cylindrical shear wall.
 */
function createConcaveThumbButton(
  yCenter: number,
  zBase: number,
  radius: number,
  wallHeight: number,
  dishDepth: number
): THREE.BufferGeometry {
  // Bottom-to-top LatheGeometry profile along +Y, then rotated to face +Z
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(radius, 0.0),
    // Flat 90-degree shear wall locking tightly against the female cutout edge under axial tension
    new THREE.Vector2(radius, wallHeight - 0.016),
    new THREE.Vector2(radius - 0.02, wallHeight),
    new THREE.Vector2(radius * 0.87, wallHeight),
  ];
  // Smooth concave thumb dish curving gently inward toward the center
  const dishSteps = 12;
  for (let i = 1; i <= dishSteps; i++) {
    const u = i / dishSteps; // 0 at outer rim -> 1 at center
    const r = radius * 0.87 * (1 - u);
    const h = wallHeight - dishDepth * Math.sin((u * Math.PI) / 2);
    profile.push(new THREE.Vector2(Math.max(0, r), h));
  }
  const geo = new THREE.LatheGeometry(profile, 48);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, yCenter, zBase);
  return geo;
}

/**
 * Creates the sculpted, slightly elongated female housing profile with tapered lower shoulders
 * matching the injection-molded center-push quick-release buckle silhouette.
 */
function createBuckleHousingShape(halfW: number, yBot: number, yTop: number): THREE.Shape {
  const s = new THREE.Shape();
  const rTop = 0.16;
  const rBot = 0.14;
  const taperX = halfW - 0.10;
  const shoulderY = yBot + 0.36;

  s.moveTo(-taperX + rBot, yBot);
  s.lineTo(taperX - rBot, yBot);
  s.quadraticCurveTo(taperX, yBot, taperX + 0.03, yBot + rBot);
  s.lineTo(halfW, shoulderY);
  s.lineTo(halfW, yTop - rTop);
  s.quadraticCurveTo(halfW, yTop, halfW - rTop, yTop);
  s.lineTo(-halfW + rTop, yTop);
  s.quadraticCurveTo(-halfW, yTop, -halfW, yTop - rTop);
  s.lineTo(-halfW, shoulderY);
  s.lineTo(-(taperX + 0.03), yBot + rBot);
  s.quadraticCurveTo(-taperX, yBot, -taperX + rBot, yBot);
  s.closePath();
  return s;
}

export function createHardwareGeometries(): HardwareGeometries {
  // ============================================================================
  // STAGE 1: CENTER-PUSH QUICK-RELEASE BUCKLE (Black POM / Acetal Plastic)
  //   - Female outer socket (elongated hollow sleeve with large circular cutout
  //     strictly on its front/top face, solid closed rear plate, open side guide
  //     channels, and flush enclosed strap anchor bars)
  //   - Male cantilevered insert tongue with raised, slightly concave circular
  //     thumb-push button snapped flush into the female cutout!
  // ============================================================================
  const buckleBodyParts: THREE.BufferGeometry[] = [];
  const buckleAccentParts: THREE.BufferGeometry[] = [];

  const halfBW = 1.16; // 2.32 cm sleek outer buckle width framing 2.0 cm strap tightly
  const halfDepth = 0.235; // 0.47 cm low-profile thickness
  const cy = HARDWARE_SPECS.buckleCenterDiscY; // 10.24 cm
  const cutoutRadius = 0.855; // Sleek arched sidewalls hugging the large circular cutout
  const buttonRadius = 0.80; // Crisp 0.55 mm concentric snap-fit gap around thumb button

  // 1a. Female Housing Front Wall (+Z) with Large Circular Cutout (y = 8.98 .. 11.50 cm)
  const frontWallShape = createBuckleHousingShape(halfBW, 8.98, 11.50);
  const circularCutout = new THREE.Path();
  circularCutout.absarc(0, cy, cutoutRadius, 0, Math.PI * 2, true);
  frontWallShape.holes.push(circularCutout);

  const frontWallDepth = 0.125;
  const frontWall = new THREE.ExtrudeGeometry(frontWallShape, {
    depth: frontWallDepth,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.018,
    bevelSegments: 3,
    curveSegments: 36,
  });
  // Sits at z in [+0.073, +0.242] — hollow underneath for the sliding male cantilevered tongue
  frontWall.translate(0, 0, 0.095);
  buckleBodyParts.push(frontWall);

  // 1b. Female Housing Solid Closed Back Wall (-Z) — real center-push buckles only have the cutout on the front face!
  const backWallShape = createBuckleHousingShape(halfBW, 8.98, 11.50);
  const backWallDepth = 0.115;
  const backWall = new THREE.ExtrudeGeometry(backWallShape, {
    depth: backWallDepth,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 24,
  });
  backWall.translate(0, 0, -halfDepth + 0.022);
  buckleBodyParts.push(backWall);

  // 1c. Upper Closed Socket Bridge + Lower Male Shoulder Collar (leaving authentic OPEN SIDE CHANNELS along y = 9.38..11.16!)
  const topSleeveWall = new THREE.BoxGeometry(halfBW * 1.88, 0.30, halfDepth * 1.66);
  topSleeveWall.translate(0, 11.32, 0);
  buckleBodyParts.push(topSleeveWall);

  const lowerCollarShape = createRoundedRectShape(-1.04, 1.04, 8.96, 9.32, 0.10);
  const lowerCollar = new THREE.ExtrudeGeometry(lowerCollarShape, {
    depth: halfDepth * 1.60,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 14,
  });
  lowerCollar.translate(0, 0, -(halfDepth * 1.60) / 2);
  buckleBodyParts.push(lowerCollar);

  //     - Subtle molded corner ejector pin bosses on the lower tapered shoulders (authentic injection-molded POM detail)
  for (const side of [-1, 1]) {
    const cornerPin = new THREE.CylinderGeometry(0.055, 0.06, 0.025, 16);
    cornerPin.rotateX(Math.PI / 2);
    cornerPin.translate(side * 0.86, 9.26, 0.232);
    buckleAccentParts.push(cornerPin);
  }

  //     - Flush enclosed strap anchor bars & rounded side arms (no boxy protruding corner ears!)
  for (const [barY, cheekY0, cheekY1, cheekHalfX] of [
    [8.86, 8.81, 9.04, 1.04],
    [11.60, 11.42, 11.67, 1.08],
  ] as const) {
    const anchorBar = new THREE.CylinderGeometry(0.082, 0.082, cheekHalfX * 2.0, 16);
    anchorBar.rotateZ(Math.PI / 2);
    anchorBar.translate(0, barY, 0);
    buckleBodyParts.push(anchorBar);

    for (const side of [-1, 1]) {
      const cheek = new THREE.BoxGeometry(0.14, cheekY1 - cheekY0, halfDepth * 1.44);
      cheek.translate(side * (cheekHalfX - 0.05), (cheekY0 + cheekY1) * 0.5, 0);
      buckleBodyParts.push(cheek);
    }
  }

  //     - Enclosed guide-rail lips framing the OPEN SIDE CHANNELS (clearly visible in 3/4 & side profile!)
  for (const side of [-1, 1]) {
    const topRail = new THREE.BoxGeometry(0.12, 1.84, 0.07);
    topRail.translate(side * (halfBW - 0.06), cy + 0.04, 0.14);
    buckleBodyParts.push(topRail);

    const botRail = new THREE.BoxGeometry(0.12, 1.84, 0.07);
    botRail.translate(side * (halfBW - 0.06), cy + 0.04, -0.14);
    buckleBodyParts.push(botRail);
  }

  // 1d. Male Cantilevered Insert Tongue + Side Alignment Forks riding inside the open side channels
  const maleTonguePlate = new THREE.BoxGeometry(1.90, 2.02, 0.10);
  maleTonguePlate.translate(0, 10.16, -0.02);
  buckleAccentParts.push(maleTonguePlate);

  for (const side of [-1, 1]) {
    const sideFork = new THREE.BoxGeometry(0.15, 1.82, 0.135);
    sideFork.translate(side * (halfBW - 0.11), 10.22, 0.0);
    buckleAccentParts.push(sideFork);
  }

  // 1e. Signature Large Concave (Dished-In) Circular Center-Push Thumb Button snapped flush into front cutout!
  const thumbButton = createConcaveThumbButton(cy, 0.02, buttonRadius, 0.226, 0.082);
  buckleAccentParts.push(thumbButton);

  const buckleBody = mergeNormalized(buckleBodyParts);
  const buckleAccent = mergeNormalized(buckleAccentParts);

  // ============================================================================
  // STAGE 2: FOLDED 2-LAYER LOWER STRAP LOOP (y = 7.115 .. 8.98 cm)
  //   Continuous U-wrapped stadium cross-section in YZ extruded across X = 2.00 cm:
  //   - Bottom rounded bend ENCLOSES the flat straight bar of the D-ring (y = 7.28 cm) cleanly!
  //   - Top rounded bend wraps cleanly around the lower buckle anchor bar (y = 8.86 cm)!
  //   - Clean distortion-free UVs on both front/back faces AND thin side edges!
  // ============================================================================
  const strapW = 2.0; // Exact 2.0 cm polyester lanyard width
  const loopBotY = HARDWARE_SPECS.dRingFlatBarY - 0.165; // 7.115 cm (encloses 0.088 cm radius D-ring bar!)
  const loopTopY = 8.98; // Wraps cleanly around lower buckle bar at y = 8.86 cm
  const loopHalfZ = 0.135; // 0.27 cm realistic 2-layer folded webbing thickness

  const loopSideProfile = createRoundedRectShape(-loopHalfZ, loopHalfZ, loopBotY, loopTopY, loopHalfZ);
  const rawLoopGeo = new THREE.ExtrudeGeometry(loopSideProfile, {
    depth: strapW,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 20,
  });
  rawLoopGeo.translate(0, 0, -strapW / 2);
  rawLoopGeo.rotateY(Math.PI / 2);

  // Assign crisp distortion-free UVs across front/back faces AND thin side edges (eliminates side-edge banding!)
  const loopPos = rawLoopGeo.getAttribute('position') as THREE.BufferAttribute;
  const loopNorm = rawLoopGeo.getAttribute('normal') as THREE.BufferAttribute;
  const loopUv = rawLoopGeo.getAttribute('uv') as THREE.BufferAttribute;
  const loopSpanY = loopTopY - loopBotY;
  for (let i = 0; i < loopPos.count; i++) {
    const x = loopPos.getX(i);
    const y = loopPos.getY(i);
    const z = loopPos.getZ(i);
    const nx = loopNorm ? Math.abs(loopNorm.getX(i)) : 0;
    const normY = THREE.MathUtils.clamp((y - loopBotY) / loopSpanY, 0, 1);
    const v = 0.018 + normY * 0.032;

    if (nx > 0.6) {
      // Side edge of folded strap: map cleanly across edge margin strip in Z so twill weave never smears!
      const zFrac = THREE.MathUtils.clamp((z + loopHalfZ) / (2 * loopHalfZ), 0, 1);
      const u = x >= 0 ? 0.96 + zFrac * 0.035 : 0.005 + zFrac * 0.035;
      loopUv.setXY(i, u, v);
    } else {
      const u = THREE.MathUtils.clamp((x + strapW / 2) / strapW, 0, 1);
      loopUv.setXY(i, u, v);
    }
  }
  loopUv.needsUpdate = true;
  rawLoopGeo.computeVertexNormals();
  rawLoopGeo.computeBoundingBox();
  const lowerStrapTab = rawLoopGeo;

  // ============================================================================
  // STAGE 2B: SMOOTH METAL DOUBLE-CAP RIVETS (Lower Loop at y = 8.08 & Upper Loop at y = 12.38)
  // ============================================================================
  const rivets = mergeNormalized([
    createDoubleCapRivet(HARDWARE_SPECS.lowerRivetY, loopHalfZ - 0.012, 1, 0.255, 0.068),
    createDoubleCapRivet(HARDWARE_SPECS.lowerRivetY, loopHalfZ - 0.012, -1, 0.255, 0.068),
    createDoubleCapRivet(HARDWARE_SPECS.upperRivetY, 0.162, 1, 0.255, 0.072),
    createDoubleCapRivet(HARDWARE_SPECS.upperRivetY, 0.162, -1, 0.255, 0.072),
  ]);

  // ============================================================================
  // STAGE 3A: WIDE METAL D-RING (y = 6.20 .. 7.36 cm, width = 2.24 cm)
  //   - Flat straight top bar (x in [-1.06, +1.06], y = 7.28 cm) sits ENCLOSED inside
  //     the folded lower strap loop so the 2.0 cm strap stays flat and evenly spread!
  //   - Crisp rounded corners emerge just outside the strap edges and sweep down into
  //     a smooth curved D-arch peaking at (0, 6.20 cm) where load funnels into the swivel!
  // ============================================================================
  const hwD = HARDWARE_SPECS.dRingHalfWidth; // 1.12 cm (2.24 cm outer width > 2.0 cm strap!)
  const yFlat = HARDWARE_SPECS.dRingFlatBarY; // 7.28 cm
  const yArch = HARDWARE_SPECS.dRingArchBottomY; // 6.20 cm
  const dRingCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.78, yFlat, 0),
      new THREE.Vector3(0.0, yFlat, 0),
      new THREE.Vector3(0.78, yFlat, 0),
      new THREE.Vector3(hwD, yFlat - 0.04, 0),
      new THREE.Vector3(hwD + 0.02, yFlat - 0.26, 0),
      new THREE.Vector3(0.86, yArch + 0.34, 0),
      new THREE.Vector3(0.46, yArch + 0.08, 0),
      new THREE.Vector3(0.0, yArch, 0),
      new THREE.Vector3(-0.46, yArch + 0.08, 0),
      new THREE.Vector3(-0.86, yArch + 0.34, 0),
      new THREE.Vector3(-(hwD + 0.02), yFlat - 0.26, 0),
      new THREE.Vector3(-hwD, yFlat - 0.04, 0),
    ],
    true,
    'centripetal',
    0.5
  );
  const splitRing = new THREE.TubeGeometry(dRingCurve, 64, 0.088, 16, true);
  splitRing.computeVertexNormals();
  splitRing.computeBoundingBox();

  // ============================================================================
  // STAGE 3B: 360° BARREL SWIVEL COLLAR + INTERLOCKING TOP SWIVEL EYE (y = 5.46 .. 6.33 cm)
  // ============================================================================
  const barrelProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.0),
    new THREE.Vector2(0.25, 0.06),
    new THREE.Vector2(0.25, 0.19),
    new THREE.Vector2(0.18, 0.23),
    new THREE.Vector2(0.18, 0.31),
    new THREE.Vector2(0.23, 0.35),
    new THREE.Vector2(0.23, 0.41),
    new THREE.Vector2(0.15, 0.45),
    new THREE.Vector2(0.0, 0.45),
  ];
  const barrelCore = new THREE.LatheGeometry(barrelProfile, 32);
  barrelCore.translate(0, 5.46, 0);

  // Interlocking YZ-plane swivel loop eye linked cleanly around the XY D-ring arch at y = 6.20 cm
  const swivelEyeCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 5.84, 0.15),
      new THREE.Vector3(0, 6.08, 0.22),
      new THREE.Vector3(0, 6.28, 0.13),
      new THREE.Vector3(0, 6.33, 0.0),
      new THREE.Vector3(0, 6.28, -0.13),
      new THREE.Vector3(0, 6.08, -0.22),
      new THREE.Vector3(0, 5.84, -0.15),
      new THREE.Vector3(0, 5.78, 0.0),
    ],
    true
  );
  const swivelEye = new THREE.TubeGeometry(swivelEyeCurve, 36, 0.072, 14, true);
  const swivelBarrel = mergeNormalized([barrelCore, swivelEye]);

  // ============================================================================
  // STAGE 3C: SPRING-LOADED LOBSTER-CLAW CLASP (y = 3.80 .. 5.56 cm)
  //   Unified cast metal teardrop spring housing + circular pivot rivet + hinged
  //   spring gate + angled side thumb lever + curved claw jaw seated in card slot!
  //   Rotates 360° WITH the card around the swivel axis at y = 5.56 cm!
  // ============================================================================
  const claspYawRad = THREE.MathUtils.degToRad(46);

  // 3C-1. Swivel Stem + Unified Cast Teardrop Spring Housing + Hinged Gate (claspBody)
  const stemProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.19, 0.0),
    new THREE.Vector2(0.21, 0.10),
    new THREE.Vector2(0.18, 0.24),
    new THREE.Vector2(0.16, 0.34),
    new THREE.Vector2(0.18, 0.42), // Mates solidly inside swivelBarrel bottom socket (y = 5.46)
    new THREE.Vector2(0.0, 0.42),
  ];
  const stem = new THREE.LatheGeometry(stemProfile, 28);
  stem.translate(0, 5.14, 0);

  // Unified flat-sided cast teardrop spring housing blending smoothly into the upper hook spine (-X -> -Z)
  const housingShape = new THREE.Shape();
  housingShape.moveTo(-0.18, 5.34);
  housingShape.lineTo(0.17, 5.34);
  housingShape.quadraticCurveTo(0.32, 5.06, 0.27, 4.74);
  housingShape.quadraticCurveTo(0.17, 4.64, 0.04, 4.72);
  housingShape.quadraticCurveTo(-0.12, 4.80, -0.26, 4.62);
  housingShape.quadraticCurveTo(-0.42, 4.86, -0.32, 5.12);
  housingShape.quadraticCurveTo(-0.24, 5.26, -0.18, 5.34);
  housingShape.closePath();

  const castHousing = new THREE.ExtrudeGeometry(housingShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.018,
    bevelSegments: 3,
    curveSegments: 18,
  });
  // Extrude runs along +Z; rotate -90° around Y so flat face lies in YZ plane (+X -> +Z gate side, -X -> -Z spine side)
  castHousing.translate(0, 0, -0.08);
  castHousing.rotateY(-Math.PI / 2);
  castHousing.rotateY(claspYawRad);

  // Hinged spring-loaded closing gate pivoting inward from the pivot pin down to meet the hook nose
  const gateCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 5.02, 0.14),
    new THREE.Vector3(0, 4.76, 0.29),
    new THREE.Vector3(0, 4.48, 0.28),
    new THREE.Vector3(0, 4.26, 0.21),
  ]);
  const gateArm = new THREE.TubeGeometry(gateCurve, 22, 0.062, 12, false);
  gateArm.rotateY(claspYawRad);

  const claspBody = mergeNormalized([stem, castHousing, gateArm]);

  // 3C-2. Side Thumb Trigger Lever + Circular Center Pivot Rivet Pin (contrasting accent finish!)
  const triggerShape = createRoundedRectShape(-0.04, 0.36, -0.075, 0.075, 0.055);
  const triggerGeo = new THREE.ExtrudeGeometry(triggerShape, {
    depth: 0.115,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 12,
  });
  triggerGeo.translate(0, 0, -0.0575);
  triggerGeo.rotateY(-Math.PI / 2);
  triggerGeo.rotateX(THREE.MathUtils.degToRad(32));
  triggerGeo.translate(0, 4.88, 0.27);
  triggerGeo.rotateY(claspYawRad);

  const pivotPin = new THREE.CylinderGeometry(0.084, 0.084, 0.24, 24);
  pivotPin.rotateZ(Math.PI / 2);
  pivotPin.translate(0, 5.00, 0.06);
  pivotPin.rotateY(claspYawRad);

  const claspThumbTrigger = mergeNormalized([triggerGeo, pivotPin]);

  // 3C-3. Sculpted Lobster-Claw Outer Hook Jaw seated snugly inside the card/case slot at y = 3.855 cm
  const hookCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 5.20, 0.05),
      new THREE.Vector3(0, 4.94, 0.24),
      new THREE.Vector3(0, 4.62, 0.31),
      new THREE.Vector3(0, 4.30, 0.23),
      new THREE.Vector3(0, 4.10, 0.22),
      new THREE.Vector3(0, 3.92, 0.165),
      new THREE.Vector3(0, HARDWARE_SPECS.hookSaddleY, 0.0), // Seated cleanly in slot punch
      new THREE.Vector3(0, 3.92, -0.165),
      new THREE.Vector3(0, 4.10, -0.22),
      new THREE.Vector3(0, 4.42, -0.35),
      new THREE.Vector3(0, 4.78, -0.40), // Sculpted curved outer lobster claw spine flowing into cast housing
      new THREE.Vector3(0, 5.08, -0.26),
      new THREE.Vector3(0, 5.20, -0.06),
    ],
    true
  );
  const claspHookLoop = new THREE.TubeGeometry(
    hookCurve,
    56,
    HARDWARE_SPECS.hookWireRadius,
    14,
    true
  );
  claspHookLoop.rotateY(claspYawRad);
  claspHookLoop.computeVertexNormals();
  claspHookLoop.computeBoundingBox();

  return {
    buckleBody,
    buckleAccent,
    lowerStrapTab,
    rivets,
    splitRing,
    swivelBarrel,
    claspBody,
    claspThumbTrigger,
    claspHookLoop,
  };
}

export function disposeHardwareGeometries(geos: HardwareGeometries): void {
  geos.buckleBody.dispose();
  geos.buckleAccent.dispose();
  geos.lowerStrapTab.dispose();
  geos.rivets.dispose();
  geos.splitRing.dispose();
  geos.swivelBarrel.dispose();
  geos.claspBody.dispose();
  geos.claspThumbTrigger.dispose();
  geos.claspHookLoop.dispose();
}
