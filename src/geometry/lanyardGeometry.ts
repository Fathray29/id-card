import * as THREE from 'three';
import { CRIMP_SPECS, getCrimpOuterHalfWidth } from './hardwareGeometry';
import {
  PLACEMENT_SPECS,
  getHangerWoodTopY,
  getTorsoSurfaceNormal,
  snapPointToTorsoSurface,
  type PlacementSceneId,
} from './placementGeometry';

/** Exact lanyard strap metric specs (1 unit = 1 cm) */
export const LANYARD_SPECS = {
  targetCircumference: 80.0,
  strapWidth: 2.0,
  strapThickness: 0.1,
  samples: 320,
  /** Bottom apex anchored cleanly inside the metal crimp clamp (0.40 cm above crimp base 6.12 cm) */
  apexY: 6.52,
  /** Crossover Z offset (+/- 0.115 cm -> 0.23 cm center-to-center > 0.10 cm thickness, zero strap slicing!) */
  crossoverZ: 0.115,
  /** Gentle crossover tilt (+/- 2.0 deg) so 2 cm strap edges never clip across the overlapping leg */
  crossoverTiltDeg: 2.0,
} as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getRawControlPointsForPlacement(placement: PlacementSceneId): THREE.Vector3[] {
  if (placement === 'table') {
    // Organic flat-lay ribbon curl sweeping gracefully up-and-RIGHT across the open desk mat,
    // staying strictly clear of both the upper-left aluminum laptop and upper-right espresso saucer!
    return [
      new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside crimp (y = 6.52)
      new THREE.Vector3(0.55, 2.2, 0.09), // Right emergence out of crimp
      new THREE.Vector3(3.8, 4.8, 0.14), // Right sweep toward open mat
      new THREE.Vector3(9.4, 8.2, 0.16), // Lower-right gentle curve
      new THREE.Vector3(12.8, 13.8, 0.16), // Outer right arc (generously clear of espresso saucer!)
      new THREE.Vector3(12.2, 20.6, 0.14), // Upper-right bend (strictly left of espresso saucer)
      new THREE.Vector3(8.6, 24.4, 0.12), // Top-right crest
      new THREE.Vector3(3.8, 23.8, 0.12), // Upper-center crest (strictly right of laptop!)
      new THREE.Vector3(0.2, 20.4, 0.14), // Mid-left turn
      new THREE.Vector3(-1.2, 14.8, 0.16), // Inner left sweep (strictly clear of laptop!)
      new THREE.Vector3(-0.6, 9.4, 0.16), // Lower-left approach
      new THREE.Vector3(0.1, 4.8, 0.13), // Return curve
      new THREE.Vector3(-0.4, 2.2, 0.08), // Left return into crimp mouth
    ];
  }

  if (placement === 'torso') {
    // Realistic neck-worn drape hugging sternum -> front chest -> collarbones -> base of neck (below neck finial)
    return [
      new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside crimp (y = 6.52, z = 0)
      new THREE.Vector3(0.55, 2.2, -0.18), // Right emergence hugging sternum
      new THREE.Vector3(3.0, 7.2, -0.55), // Right mid sternum
      new THREE.Vector3(5.6, 13.0, -1.65), // Right upper chest
      new THREE.Vector3(7.2, 18.6, -4.6), // Right collarbone / inner trapezius
      new THREE.Vector3(6.6, 21.8, -9.8), // Right base of neck (y ≈ 28.3 cm)
      new THREE.Vector3(4.8, 23.4, -13.9), // Right lower back of neck (y ≈ 29.9 cm)
      new THREE.Vector3(0.0, 24.0, -15.4), // Back of neck collar base (y ≈ 30.5 cm, cleanly below finial!)
      new THREE.Vector3(-4.8, 23.4, -13.9), // Left lower back of neck
      new THREE.Vector3(-6.6, 21.8, -9.8), // Left base of neck
      new THREE.Vector3(-7.2, 18.6, -4.6), // Left collarbone / inner trapezius
      new THREE.Vector3(-5.6, 13.0, -1.65), // Left upper chest
      new THREE.Vector3(-3.0, 7.2, -0.55), // Left mid sternum
      new THREE.Vector3(-0.55, 2.2, -0.18), // Left return into crimp mouth
    ];
  }

  if (placement === 'hanger') {
    // Gravity-pulled vertical drape sitting FLUSH onto the walnut coat hanger crest around the brass ferrule
    const crestBackRelY = getHangerWoodTopY(0) + 0.18 - LANYARD_SPECS.apexY;
    const ridgeRelY = getHangerWoodTopY(1.65) + 0.09 - LANYARD_SPECS.apexY;
    const woodMidRelY = PLACEMENT_SPECS.hanger.woodBottomY + 1.3 - LANYARD_SPECS.apexY;
    const barRelY = PLACEMENT_SPECS.hanger.trouserBarY - LANYARD_SPECS.apexY;
    return [
      new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside crimp (y = 6.52)
      new THREE.Vector3(0.38, 2.4, 0.14), // Right upright emergence
      new THREE.Vector3(1.55, 8.8, 0.44), // Right lower drop
      new THREE.Vector3(2.85, 17.4, 0.78), // Right mid drop
      new THREE.Vector3(3.15, barRelY, 1.02), // Passes cleanly in front of trouser bar
      new THREE.Vector3(2.85, woodMidRelY, 1.02), // Passes cleanly in front of walnut neck
      new THREE.Vector3(1.65, ridgeRelY, 0.24), // Sits flush right on walnut shoulder crest beside ferrule
      new THREE.Vector3(0.0, crestBackRelY, -0.78), // Hugs tightly behind brass ferrule & steel hook stem
      new THREE.Vector3(-1.65, ridgeRelY, 0.24), // Left walnut shoulder crest
      new THREE.Vector3(-2.85, woodMidRelY, 1.02), // Left front of walnut neck
      new THREE.Vector3(-3.15, barRelY, 1.02), // Left front of trouser bar
      new THREE.Vector3(-2.85, 17.4, 0.78), // Left mid drop
      new THREE.Vector3(-1.55, 8.8, 0.44), // Left lower drop
      new THREE.Vector3(-0.38, 2.4, 0.14), // Left return into crimp mouth
    ];
  }

  // Default 'studio': Teardrop collar drape (exact original geometry!)
  return [
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
}

/**
 * Constructs the closed 3D lanyard spline for the requested placement simulation and iteratively
 * normalizes control points around the bottom apex until exact arc length equals 80.00 cm.
 */
export function buildNormalizedLanyardCurve(placement: PlacementSceneId = 'studio'): {
  curve: THREE.CatmullRomCurve3;
  points: THREE.Vector3[];
  cumulativeLengths: number[];
  totalLength: number;
  topY: number;
} {
  const anchor = new THREE.Vector3(0, LANYARD_SPECS.apexY, 0);
  let scaledOffsets = getRawControlPointsForPlacement(placement).map((p) => p.clone());

  const buildFromOffsets = (offsets: THREE.Vector3[]) => {
    const worldPts = offsets.map((p, idx) => {
      const w = p.clone().add(anchor);
      if (placement === 'torso' && idx > 0) {
        const attachBlend = smoothstep(CRIMP_SPECS.topY + 0.1, CRIMP_SPECS.topY + 1.8, w.y);
        const snapped = snapPointToTorsoSurface(w, 0.115);
        return w.lerp(snapped, attachBlend);
      }
      if (placement === 'table' && idx > 0) {
        // Keep flat-lay desk curve strictly above the desk mat plane (local z >= 0.07)
        w.z = Math.max(0.07, Math.min(0.24, w.z));
      }
      return w;
    });
    return new THREE.CatmullRomCurve3(worldPts, true, 'centripetal', 0.5);
  };

  let curve = buildFromOffsets(scaledOffsets);

  for (let pass = 0; pass < 16; pass++) {
    const currentLength = curve.getLength();
    if (Math.abs(currentLength - LANYARD_SPECS.targetCircumference) < 0.005) {
      break;
    }
    const factor = LANYARD_SPECS.targetCircumference / currentLength;
    scaledOffsets = scaledOffsets.map((p, idx) => {
      if (placement === 'table') {
        // Scale X and Y in the tabletop plane while keeping Z height gently bounded
        return new THREE.Vector3(p.x * factor, p.y * factor, p.z);
      }
      if (placement === 'torso') {
        // Keep collar naturally seated around the base of the neck (<= 31.2 cm, well below walnut finial)
        // and gently scale chest/collarbone X flare to hit exact 80.0 cm arc length!
        if (idx === 0) return p.clone();
        const step = THREE.MathUtils.clamp((factor - 1.0) * 0.9, -0.07, 0.07);
        const isChest = idx <= 4 || idx >= 10;
        const nextX = isChest ? p.x * (1.0 + step * 1.4) : p.x;
        const nextY = Math.min(
          31.2 - LANYARD_SPECS.apexY,
          p.y * (1.0 + step * 0.45)
        );
        return new THREE.Vector3(nextX, nextY, p.z);
      }
      if (placement === 'hanger') {
        // Lock the 3 crest points (indices 6, 7, 8) strictly onto the walnut wood ridge so they NEVER float above the ferrule!
        if (idx >= 6 && idx <= 8) {
          return p.clone();
        }
        return new THREE.Vector3(p.x * Math.pow(factor, 1.8), p.y, p.z);
      }
      return p.clone().multiplyScalar(factor);
    });
    curve = buildFromOffsets(scaledOffsets);
  }

  let sampled = curve.getSpacedPoints(LANYARD_SPECS.samples);

  // Final flush surface attachment for torso so EVERY dense spline sample hugs the linen bust with zero floating gap!
  if (placement === 'torso') {
    sampled = sampled.map((pt, i) => {
      if (i === 0 || i === sampled.length - 1) return pt;
      const attachBlend = smoothstep(CRIMP_SPECS.topY + 0.1, CRIMP_SPECS.topY + 1.8, pt.y);
      if (attachBlend <= 1e-4) return pt;
      const snapped = snapPointToTorsoSurface(pt, 0.115);
      return pt.clone().lerp(snapped, attachBlend);
    });
  } else if (placement === 'table') {
    sampled = sampled.map((pt, i) => {
      if (i === 0 || i === sampled.length - 1) return pt;
      const out = pt.clone();
      out.z = Math.max(0.06, out.z);
      return out;
    });
  }

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
  const falloffSpan = 0.18; // Smooth separation well past the V-junction overlap zone

  if (t < falloffSpan) {
    // Outgoing right strap: sits cleanly in front (+Z) with zero clipping into the back strap
    const s = 1.0 - t / falloffSpan;
    const smooth = s * s * (3 - 2 * s);
    return {
      zOffset: maxZ * smooth,
      twistRad: maxTiltRad * smooth,
    };
  }

  if (t > 1.0 - falloffSpan) {
    // Incoming left strap: sits cleanly behind (-Z)
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
export function createLanyardGeometry(placement: PlacementSceneId = 'studio'): {
  geometry: THREE.BufferGeometry;
  totalLength: number;
  topY: number;
} {
  const { points, cumulativeLengths, totalLength, topY } = buildNormalizedLanyardCurve(placement);
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
    // On flat table, lift crossover slightly upward (+Z) rather than sinking negative into desk
    if (placement === 'table') {
      p.z += zOffset >= 0 ? zOffset + 0.04 : Math.max(-0.02, zOffset * 0.35);
      twistAngles.push(twistRad * 0.35);
    } else {
      p.z += zOffset;
      twistAngles.push(twistRad);
    }
    spine.push(p);
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

    if (placement === 'table') {
      // On a flat desk, keep the ribbon face lying flat facing +Z (world UP) everywhere along the curve!
      const currN = new THREE.Vector3(0, 0, 1).addScaledVector(currT, -currT.z).normalize();
      const currB = new THREE.Vector3().crossVectors(currT, currN).normalize();
      normals.push(currN);
      binormals.push(currB);
      continue;
    }

    if (placement === 'torso') {
      // Align the 2 cm wide ribbon normal directly to the outward torso bust surface normal
      // so the strap hugs chest, collarbones, shoulders, and neck completely flush with zero lifted edges!
      const surfN = getTorsoSurfaceNormal(spine[i]);
      const attachBlend = smoothstep(CRIMP_SPECS.topY + 0.15, CRIMP_SPECS.topY + 2.4, spine[i].y);
      const blendedN = new THREE.Vector3(0, 0, 1).lerp(surfN, attachBlend);
      // Orthogonalize against tangent currT
      const currN = blendedN.addScaledVector(currT, -blendedN.dot(currT)).normalize();
      const currB = new THREE.Vector3().crossVectors(currT, currN).normalize();
      normals.push(currN);
      binormals.push(currB);
      continue;
    }

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
  const holonomyError =
    placement === 'table' || placement === 'torso'
      ? 0
      : Math.atan2(desiredEndN.dot(endB), desiredEndN.dot(endN));

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
