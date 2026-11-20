import * as THREE from 'three';
import { CRIMP_SPECS, getCrimpOuterHalfWidth } from './hardwareGeometry';

/** Exact lanyard strap metric specs (1 unit = 1 cm) */
export const LANYARD_SPECS = {
  targetCircumference: 80.0,
  strapWidth: 2.0,
  strapThickness: 0.1,
  samples: 320,
  /** Bottom apex anchored cleanly inside the metal crimp clamp (0.40 cm above crimp base 6.12 cm) */
  apexY: 6.52,
  /** Crossover Z offset (+/- 0.08 cm) at apex to avoid Z-fighting */
  crossoverZ: 0.08,
  /** Crossover tilt angle (+/- 10 deg) just above the crimp mouth */
  crossoverTiltDeg: 10,
} as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Constructs the closed 3D teardrop neck lanyard spline and iteratively normalizes
 * control points around the bottom apex until exact arc length equals 80.00 cm (+/- 0.01 cm).
 * The lower legs emerge cleanly upright out of the top mouth of the metal crimp before flaring into a V.
 */
export function buildNormalizedLanyardCurve(): {
  curve: THREE.CatmullRomCurve3;
  points: THREE.Vector3[];
  cumulativeLengths: number[];
  totalLength: number;
  topY: number;
} {
  const anchor = new THREE.Vector3(0, LANYARD_SPECS.apexY, 0);

  // Teardrop collar drape: narrow upright emergence through crimp top mouth (y = 7.36 cm),
  // then smooth graceful V-flare up over collarbone and behind the neck.
  const rawControlPoints = [
    new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex deep inside metal crimp (y = 6.52 cm)
    new THREE.Vector3(0.32, 2.0, 0.08), // Right vertical emergence out of crimp mouth
    new THREE.Vector3(1.38, 5.8, 0.22), // Right lower V flare
    new THREE.Vector3(3.2, 12.2, 0.34), // Right chest drape
    new THREE.Vector3(5.3, 20.8, -0.05), // Right mid rise
    new THREE.Vector3(6.45, 28.4, -1.15), // Right collarbone curve
    new THREE.Vector3(4.95, 32.3, -2.55), // Right neck arc
    new THREE.Vector3(0.0, 33.15, -3.15), // Back of neck crest (~y = 39.5 cm)
    new THREE.Vector3(-4.95, 32.3, -2.55), // Left neck arc
    new THREE.Vector3(-6.45, 28.4, -1.15), // Left collarbone curve
    new THREE.Vector3(-5.3, 20.8, -0.05), // Left mid descent
    new THREE.Vector3(-3.2, 12.2, 0.34), // Left chest drape
    new THREE.Vector3(-1.38, 5.8, 0.22), // Left lower V flare
    new THREE.Vector3(-0.32, 2.0, 0.08), // Left vertical return into crimp mouth
  ];

  // Iteratively normalize total curve circumference to exact 80.00 cm (within +/- 0.01 cm)
  let scaledOffsets = rawControlPoints.map((p) => p.clone());
  let curve = new THREE.CatmullRomCurve3(
    scaledOffsets.map((p) => p.clone().add(anchor)),
    true,
    'centripetal',
    0.5
  );

  for (let pass = 0; pass < 6; pass++) {
    const currentLength = curve.getLength();
    if (Math.abs(currentLength - LANYARD_SPECS.targetCircumference) < 0.002) {
      break;
    }
    const factor = LANYARD_SPECS.targetCircumference / currentLength;
    scaledOffsets = scaledOffsets.map((p) => p.clone().multiplyScalar(factor));
    curve = new THREE.CatmullRomCurve3(
      scaledOffsets.map((p) => p.clone().add(anchor)),
      true,
      'centripetal',
      0.5
    );
  }

  const sampled = curve.getSpacedPoints(LANYARD_SPECS.samples);
  const cumulativeLengths: number[] = [0];
  let totalLength = 0;
  let topY = -Infinity;

  for (let i = 0; i < sampled.length; i++) {
    if (sampled[i].y > topY) topY = sampled[i].y;
    if (i > 0) {
      totalLength += sampled[i].distanceTo(sampled[i - 1]);
      cumulativeLengths.push(totalLength);
    }
  }

  return {
    curve,
    points: sampled,
    cumulativeLengths,
    totalLength,
    topY,
  };
}

/**
 * Computes smooth crossover Z-offset and twist angle near the bottom apex (t -> 0 or t -> 1)
 * so the two incoming 2.0 cm polyester strap ends overlap cleanly inside the metal crimp
 * with +/- 0.08 cm Z separation, preventing Z-fighting.
 */
export function computeApexCrossover(t: number): { zOffset: number; twistRad: number } {
  const maxZ = LANYARD_SPECS.crossoverZ;
  const maxTiltRad = THREE.MathUtils.degToRad(LANYARD_SPECS.crossoverTiltDeg);
  const falloffSpan = 0.14; // Smooth transition over first/last 14% of loop

  if (t < falloffSpan) {
    // Outgoing right strap: shifts forward (+Z) and tilts gently above the crimp
    const s = 1.0 - t / falloffSpan;
    const smooth = s * s * (3 - 2 * s);
    return {
      zOffset: maxZ * smooth,
      twistRad: maxTiltRad * smooth,
    };
  }

  if (t > 1.0 - falloffSpan) {
    // Incoming left strap: shifts backward (-Z) and tilts gently above the crimp
    const s = (t - (1.0 - falloffSpan)) / falloffSpan;
    const smooth = s * s * (3 - 2 * s);
    return {
      zOffset: -maxZ * smooth,
      twistRad: -maxTiltRad * smooth,
    };
  }

  return { zOffset: 0, twistRad: 0 };
}

/**
 * Generates the procedural 80.0 cm x 2.0 cm x 0.10 cm woven polyester lanyard ribbon
 * using holonomy-corrected parallel transport (Bishop) frames along the normalized spline,
 * smoothly pinching the fabric cleanly inside the metal crimp clamp jaws so zero vertices
 * ever clip or poke through the clamp housing from any 360° angle.
 */
export function createLanyardGeometry(): {
  geometry: THREE.BufferGeometry;
  totalLength: number;
  topY: number;
} {
  const { points, cumulativeLengths, totalLength, topY } = buildNormalizedLanyardCurve();
  const N = LANYARD_SPECS.samples;
  const halfW = LANYARD_SPECS.strapWidth / 2; // 1.0 cm
  const halfT = LANYARD_SPECS.strapThickness / 2; // 0.05 cm
  const chamferW = 0.045;
  const chamferT = 0.022;

  // 8-point beveled rectangular cross-section normalized by widthScale in local (widthAxis, thicknessAxis)
  const profile: Array<{ wNorm: number; th: number; u: number }> = [
    { wNorm: -1 + chamferW / halfW, th: halfT, u: 0.02 },
    { wNorm: 1 - chamferW / halfW, th: halfT, u: 0.98 },
    { wNorm: 1.0, th: halfT - chamferT, u: 1.0 },
    { wNorm: 1.0, th: -halfT + chamferT, u: 1.0 },
    { wNorm: 1 - chamferW / halfW, th: -halfT, u: 0.98 },
    { wNorm: -1 + chamferW / halfW, th: -halfT, u: 0.02 },
    { wNorm: -1.0, th: -halfT + chamferT, u: 0.0 },
    { wNorm: -1.0, th: halfT - chamferT, u: 0.0 },
  ];
  const P = profile.length;

  // Apply apex crossover Z-offset to sampled spine positions
  const spine: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const twistAngles: number[] = [];

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const { zOffset, twistRad } = computeApexCrossover(t);
    const p = points[i].clone();
    p.z += zOffset;
    spine.push(p);
    twistAngles.push(twistRad);
  }

  for (let i = 0; i <= N; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(N, i + 1)];
    tangents.push(new THREE.Vector3().subVectors(next, prev).normalize());
  }

  // Parallel transport frames initialized flat facing +Z at the bottom crimp apex
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  const initT = tangents[0];
  const refZ = new THREE.Vector3(0, 0, 1);
  const initB = new THREE.Vector3().crossVectors(initT, refZ).normalize();
  const initN = new THREE.Vector3().crossVectors(initB, initT).normalize();
  normals.push(initN);
  binormals.push(initB);

  const rotAxis = new THREE.Vector3();
  const rotQuat = new THREE.Quaternion();

  for (let i = 1; i <= N; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const prevN = normals[i - 1].clone();

    rotAxis.crossVectors(prevT, currT);
    const sinA = rotAxis.length();
    if (sinA > 1e-6) {
      rotAxis.normalize();
      const cosA = THREE.MathUtils.clamp(prevT.dot(currT), -1, 1);
      const angle = Math.atan2(sinA, cosA);
      rotQuat.setFromAxisAngle(rotAxis, angle);
      prevN.applyQuaternion(rotQuat);
    }

    const currB = new THREE.Vector3().crossVectors(currT, prevN).normalize();
    const currN = new THREE.Vector3().crossVectors(currB, currT).normalize();
    normals.push(currN);
    binormals.push(currB);
  }

  // Cancel closed-loop 3D Bishop holonomy so the returning left leg arrives flat facing +Z inside the crimp
  const endT = tangents[N];
  const desiredEndN = new THREE.Vector3(0, 0, 1)
    .addScaledVector(endT, -endT.z)
    .normalize();
  const endN = normals[N];
  const endB = binormals[N];
  const holonomyError = Math.atan2(desiredEndN.dot(endB), desiredEndN.dot(endN));

  const ringStride = P + 1;
  const vertexCount = (N + 1) * ringStride;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const twistedB = new THREE.Vector3();
  const twistedN = new THREE.Vector3();
  const flatB = new THREE.Vector3();
  const flatN = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const center = spine[i];
    const b = binormals[i];
    const n = normals[i];

    // Smoothly feather twist to 0 inside the flat steel crimp jaws (y <= 7.36 cm) so corners never poke through Z faces
    const crimpBlend = 1.0 - smoothstep(CRIMP_SPECS.topY - 0.12, CRIMP_SPECS.topY + 0.85, center.y);
    const effectiveTwist =
      twistAngles[i] * (1.0 - crimpBlend) + holonomyError * t * (1.0 - crimpBlend * 0.85);

    const cosTw = Math.cos(effectiveTwist);
    const sinTw = Math.sin(effectiveTwist);
    twistedB.copy(b).multiplyScalar(cosTw).addScaledVector(n, sinTw);
    twistedN.copy(n).multiplyScalar(cosTw).addScaledVector(b, -sinTw);

    // Inside the crimp jaws, align the strap cross-section strictly horizontal (along X) and flat (normal along Z)
    // so the ribbon never tilts diagonally below the crimp bottom edge!
    if (crimpBlend > 1e-4) {
      const signB = twistedB.x >= 0 ? 1 : -1;
      const signN = twistedN.z >= 0 ? 1 : -1;
      flatB.set(signB, 0, 0);
      flatN.set(0, 0, signN);
      twistedB.lerp(flatB, crimpBlend).normalize();
      twistedN.lerp(flatN, crimpBlend).normalize();
    }

    // Physically pinch the 2.0 cm strap cleanly into the tapered steel crimp housing (y <= 7.55 cm)
    const jawPinch = smoothstep(LANYARD_SPECS.apexY, CRIMP_SPECS.topY + 0.35, center.y);
    const localHalfW = THREE.MathUtils.lerp(0.46, halfW, jawPinch);

    const vCoord = cumulativeLengths[i] / LANYARD_SPECS.targetCircumference;

    for (let j = 0; j <= P; j++) {
      const prof = profile[j % P];
      vertex
        .copy(center)
        .addScaledVector(twistedB, prof.wNorm * localHalfW)
        .addScaledVector(twistedN, prof.th);

      // Strict physical containment inside metal crimp jaws (y <= crimp top mouth) -> mathematically zero poke-through!
      if (vertex.y <= CRIMP_SPECS.topY + 0.02) {
        vertex.y = Math.max(CRIMP_SPECS.bottomY + 0.18, vertex.y);
        const maxInnerX = Math.max(0.2, getCrimpOuterHalfWidth(vertex.y) - 0.12);
        vertex.x = THREE.MathUtils.clamp(vertex.x, -maxInnerX, maxInnerX);
        const maxInnerZ = CRIMP_SPECS.halfDepthZ - 0.08;
        vertex.z = THREE.MathUtils.clamp(vertex.z, -maxInnerZ, maxInnerZ);
      }

      const idx = i * ringStride + j;
      positions[idx * 3] = vertex.x;
      positions[idx * 3 + 1] = vertex.y;
      positions[idx * 3 + 2] = vertex.z;

      uvs[idx * 2] = prof.u;
      uvs[idx * 2 + 1] = vCoord;
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < P; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    totalLength,
    topY,
  };
}
