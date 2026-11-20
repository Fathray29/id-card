import * as THREE from 'three';

/** Exact lanyard strap metric specs (1 unit = 1 cm) */
export const LANYARD_SPECS = {
  targetCircumference: 80.0,
  strapWidth: 2.0,
  strapThickness: 0.1,
  samples: 320,
  /** Bottom apex anchored cleanly inside the metal crimp clamp above the clasp */
  apexY: 6.75,
  /** Crossover Z offset (+/- 0.08 cm) at apex to avoid Z-fighting */
  crossoverZ: 0.08,
  /** Crossover tilt angle (+/- 14 deg) at apex */
  crossoverTiltDeg: 14,
} as const;

/**
 * Constructs the closed 3D teardrop neck lanyard spline and iteratively normalizes
 * control points around the bottom apex until exact arc length equals 80.00 cm (+/- 0.01 cm).
 */
export function buildNormalizedLanyardCurve(): {
  curve: THREE.CatmullRomCurve3;
  points: THREE.Vector3[];
  cumulativeLengths: number[];
  totalLength: number;
  topY: number;
} {
  const anchor = new THREE.Vector3(0, LANYARD_SPECS.apexY, 0);

  // Initial teardrop collar drape control points (start at bottom apex, rise right, arc over neck, descend left)
  const rawControlPoints = [
    new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex (inside crimp)
    new THREE.Vector3(1.15, 3.8, 0.18), // Right lower flare
    new THREE.Vector3(3.15, 11.2, 0.35), // Right chest drape
    new THREE.Vector3(5.3, 20.5, -0.05), // Right mid rise
    new THREE.Vector3(6.45, 28.4, -1.15), // Right collarbone curve
    new THREE.Vector3(4.95, 32.3, -2.55), // Right neck arc
    new THREE.Vector3(0.0, 33.15, -3.15), // Back of neck crest (~y = 39.5 cm)
    new THREE.Vector3(-4.95, 32.3, -2.55), // Left neck arc
    new THREE.Vector3(-6.45, 28.4, -1.15), // Left collarbone curve
    new THREE.Vector3(-5.3, 20.5, -0.05), // Left mid descent
    new THREE.Vector3(-3.15, 11.2, 0.35), // Left chest drape
    new THREE.Vector3(-1.15, 3.8, 0.18), // Left lower flare
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
 * with +/- 0.08 cm Z separation and +/- 14 deg twist, preventing Z-fighting.
 */
export function computeApexCrossover(t: number): { zOffset: number; twistRad: number } {
  const maxZ = LANYARD_SPECS.crossoverZ;
  const maxTiltRad = THREE.MathUtils.degToRad(LANYARD_SPECS.crossoverTiltDeg);
  const falloffSpan = 0.14; // Smooth transition over first/last 14% of loop

  if (t < falloffSpan) {
    // Outgoing right strap: shifts forward (+Z) and tilts +14 deg
    const s = 1.0 - t / falloffSpan;
    const smooth = s * s * (3 - 2 * s);
    return {
      zOffset: maxZ * smooth,
      twistRad: maxTiltRad * smooth,
    };
  }

  if (t > 1.0 - falloffSpan) {
    // Incoming left strap: shifts backward (-Z) and tilts -14 deg
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
 * using parallel transport (Bishop) frames along the normalized spline, sweeping a
 * beveled rectangular cross-section with continuous UVs:
 *   u in [0, 1] across the 2.0 cm strap width
 *   v = cumulativeArcLength / 80.0 in [0, 1] along the 80.0 cm loop
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

  // 8-point beveled rectangular cross-section in local (widthAxis, thicknessAxis)
  // Plus explicit UV u-coordinate mapping cleanly [0..1] across both front & back faces
  const profile: Array<{ w: number; th: number; u: number }> = [
    { w: -halfW + chamferW, th: halfT, u: 0.02 },
    { w: halfW - chamferW, th: halfT, u: 0.98 },
    { w: halfW, th: halfT - chamferT, u: 1.0 },
    { w: halfW, th: -halfT + chamferT, u: 1.0 },
    { w: halfW - chamferW, th: -halfT, u: 0.98 },
    { w: -halfW + chamferW, th: -halfT, u: 0.02 },
    { w: -halfW, th: -halfT + chamferT, u: 0.0 },
    { w: -halfW, th: halfT - chamferT, u: 0.0 },
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

  // Parallel transport frames initialized so strap lies flat facing forward (+Z) at bottom apex
  // Right-handed frame: B points +X (across 2cm width, left->right), T points +Y (up strap), N points +Z (outward front)
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  const initT = tangents[0];
  const refZ = new THREE.Vector3(0, 0, 1);
  const initB = new THREE.Vector3().crossVectors(initT, refZ).normalize(); // +X across 2cm width
  const initN = new THREE.Vector3().crossVectors(initB, initT).normalize(); // +Z strap thickness normal
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

    // Re-orthonormalize maintaining right-handed (B, T, N)
    const currB = new THREE.Vector3().crossVectors(currT, prevN).normalize();
    const currN = new THREE.Vector3().crossVectors(currB, currT).normalize();
    normals.push(currN);
    binormals.push(currB);
  }

  // Build ribbon vertex buffers (duplicate closing edge of profile for clean UV seams)
  const ringStride = P + 1;
  const vertexCount = (N + 1) * ringStride;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const twistedB = new THREE.Vector3();
  const twistedN = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= N; i++) {
    const center = spine[i];
    const b = binormals[i];
    const n = normals[i];
    const twist = twistAngles[i];

    // Rotate (b, n) around tangent by twist angle
    const cosTw = Math.cos(twist);
    const sinTw = Math.sin(twist);
    twistedB.copy(b).multiplyScalar(cosTw).addScaledVector(n, sinTw);
    twistedN.copy(n).multiplyScalar(cosTw).addScaledVector(b, -sinTw);

    // Subtle natural ribbon flattening across collarbone/neck
    const vCoord = cumulativeLengths[i] / LANYARD_SPECS.targetCircumference;

    for (let j = 0; j <= P; j++) {
      const prof = profile[j % P];
      vertex
        .copy(center)
        .addScaledVector(twistedB, prof.w)
        .addScaledVector(twistedN, prof.th);

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
