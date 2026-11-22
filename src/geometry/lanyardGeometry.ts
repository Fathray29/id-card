import * as THREE from 'three';
import { CRIMP_SPECS, getCrimpOuterHalfWidth } from './hardwareGeometry';
import {
  PLACEMENT_SPECS,
  computeTorsoSignedClearance,
  getHangerWoodTopY,
  getTorsoSurfaceNormal,
  projectPointOutsideTorso,
  snapPointToTorsoSurface,
  type PlacementSceneId,
} from './placementGeometry';

/** Exact lanyard strap metric specs (1 unit = 1 cm) */
export const LANYARD_SPECS = {
  targetCircumference: 80.0,
  strapWidth: 2.0,
  strapThickness: 0.1,
  samples: 320,
  /** Bottom apex anchored cleanly inside the matte-black stopper buckle's top bar slot (y = 11.24 cm) */
  apexY: 11.24,
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
    // Organic flat-lay ribbon curl emerging from the matte-black stopper buckle (y = 11.48) and sweeping
    // gracefully up-and-RIGHT across the open desk mat, strictly clear of both the laptop and espresso saucer!
    return [
      new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside buckle top bar (y = 11.48)
      new THREE.Vector3(0.16, 1.4, 0.07), // Straight riveted collar exit
      new THREE.Vector3(3.4, 3.8, 0.13), // Right sweep toward open desk mat
      new THREE.Vector3(9.2, 6.8, 0.16), // Lower-right gentle curve
      new THREE.Vector3(12.6, 12.2, 0.16), // Outer right arc (generously clear of espresso saucer!)
      new THREE.Vector3(12.0, 18.6, 0.14), // Upper-right bend
      new THREE.Vector3(8.4, 22.2, 0.12), // Top-right crest
      new THREE.Vector3(3.6, 21.8, 0.12), // Upper-center crest (strictly right of laptop!)
      new THREE.Vector3(0.2, 18.2, 0.14), // Mid-left turn
      new THREE.Vector3(-1.0, 13.0, 0.16), // Inner left sweep (strictly clear of laptop!)
      new THREE.Vector3(-0.5, 7.8, 0.16), // Lower-left approach
      new THREE.Vector3(0.06, 3.6, 0.12), // Return curve
      new THREE.Vector3(-0.14, 1.4, 0.07), // Left return through upper rivet into buckle slot
    ];
  }

  if (placement === 'torso') {
    // Natural gravity-tensioned neck drape emerging straight through the upper rivet above the matte-black
    // stopper buckle (y = 11.48) and hugging upper chest -> inner collarbone -> nape of neck!
    return [
      new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside buckle top bar (y = 11.48, z = 0)
      new THREE.Vector3(0.18, 1.35, -0.14), // Straight riveted collar exit (y = 12.83)
      new THREE.Vector3(4.2, 4.4, -0.78), // Right upper sternum
      new THREE.Vector3(8.8, 8.6, -2.55), // Right upper chest / pectoral sweep
      new THREE.Vector3(10.2, 13.2, -5.35), // Right collarbone / inner shoulder
      new THREE.Vector3(7.4, 16.8, -9.8), // Right base of neck (y ≈ 28.3 cm)
      new THREE.Vector3(4.95, 18.4, -13.9), // Right rear base of neck (y ≈ 29.9 cm)
      new THREE.Vector3(0.0, 19.2, -15.5), // Nape of neck collar base (y ≈ 30.7 cm, cleanly below finial)
      new THREE.Vector3(-4.95, 18.4, -13.9), // Left rear base of neck
      new THREE.Vector3(-7.4, 16.8, -9.8), // Left base of neck
      new THREE.Vector3(-10.2, 13.2, -5.35), // Left collarbone / inner shoulder
      new THREE.Vector3(-8.8, 8.6, -2.55), // Left upper chest / pectoral sweep
      new THREE.Vector3(-4.2, 4.4, -0.78), // Left upper sternum
      new THREE.Vector3(-0.18, 1.35, -0.14), // Left return through upper rivet into buckle slot
    ];
  }

  if (placement === 'hanger') {
    // Clean gravity-pulled vertical drape sitting FLUSH onto the sculpted walnut wishbone crest around the brass ferrule
    const crestBackRelY = getHangerWoodTopY(0) + 0.34 - LANYARD_SPECS.apexY;
    const ridgeRelY = getHangerWoodTopY(2.1) + 0.42 - LANYARD_SPECS.apexY;
    const woodMidRelY = PLACEMENT_SPECS.hanger.woodBottomY + 1.15 - LANYARD_SPECS.apexY;
    const upperDropRelY = PLACEMENT_SPECS.hanger.woodBottomY - 6.8 - LANYARD_SPECS.apexY;
    return [
      new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside buckle top bar (y = 11.48)
      new THREE.Vector3(0.14, 1.55, 0.08), // Straight riveted collar exit
      new THREE.Vector3(1.45, 7.8, 0.34), // Right lower drop
      new THREE.Vector3(2.85, 17.0, 0.64), // Right mid drop
      new THREE.Vector3(3.15, upperDropRelY, 0.88), // Right upper straight drop
      new THREE.Vector3(2.85, woodMidRelY, 1.02), // Clears sculpted walnut neck front cleanly
      new THREE.Vector3(2.15, ridgeRelY, 0.56), // Sits cleanly atop walnut crest beside brass ferrule
      new THREE.Vector3(0.0, crestBackRelY, -0.84), // Hugs tightly behind brass ferrule & steel hook stem
      new THREE.Vector3(-2.15, ridgeRelY, 0.56), // Left walnut shoulder crest
      new THREE.Vector3(-2.85, woodMidRelY, 1.02), // Left front of walnut neck
      new THREE.Vector3(-3.15, upperDropRelY, 0.88), // Left upper straight drop
      new THREE.Vector3(-2.85, 17.0, 0.64), // Left mid drop
      new THREE.Vector3(-1.45, 7.8, 0.34), // Left lower drop
      new THREE.Vector3(-0.14, 1.55, 0.08), // Left return through upper rivet into buckle slot
    ];
  }

  // Default 'studio': Classic vertical event lanyard drape rising cleanly through the upper rivet collar
  return [
    new THREE.Vector3(0.0, 0.0, 0.0), // Bottom apex inside buckle top bar (y = 11.48 cm)
    new THREE.Vector3(0.14, 1.45, 0.04), // Straight riveted collar exit (pins cleanly under upper rivet!)
    new THREE.Vector3(1.25, 5.2, 0.18), // Right lower V flare
    new THREE.Vector3(3.35, 11.8, 0.30), // Right chest drape
    new THREE.Vector3(5.45, 20.4, -0.06), // Right mid rise
    new THREE.Vector3(6.5, 27.6, -1.15), // Right collarbone curve
    new THREE.Vector3(4.95, 31.4, -2.55), // Right neck arc
    new THREE.Vector3(0.0, 32.3, -3.15), // Back of neck crest (~y = 43.8 cm)
    new THREE.Vector3(-4.95, 31.4, -2.55), // Left neck arc
    new THREE.Vector3(-6.5, 27.6, -1.15), // Left collarbone curve
    new THREE.Vector3(-5.45, 20.4, -0.06), // Left mid descent
    new THREE.Vector3(-3.35, 11.8, 0.30), // Left chest drape
    new THREE.Vector3(-1.25, 5.2, 0.18), // Left lower V flare
    new THREE.Vector3(-0.14, 1.45, 0.04), // Left return through upper rivet into buckle slot
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

  const preSmoothTargetLength =
    placement === 'torso'
      ? LANYARD_SPECS.targetCircumference + 1.32
      : LANYARD_SPECS.targetCircumference;

  for (let pass = 0; pass < 16; pass++) {
    const currentLength = curve.getLength();
    if (Math.abs(currentLength - preSmoothTargetLength) < 0.005) {
      break;
    }
    const factor = preSmoothTargetLength / currentLength;
    scaledOffsets = scaledOffsets.map((p, idx) => {
      if (placement === 'table') {
        // Scale X and Y in the tabletop plane while keeping Z height gently bounded
        return new THREE.Vector3(p.x * factor, p.y * factor, p.z);
      }
      if (placement === 'torso') {
        // Keep collar naturally seated around the base of the neck (<= 31.4 cm, well below walnut finial)
        // and gently scale chest/collarbone X flare to hit exact 80.0 cm arc length!
        if (idx === 0) return p.clone();
        const step = THREE.MathUtils.clamp((factor - 1.0) * 1.15, -0.09, 0.09);
        const isChest = idx <= 4 || idx >= 10;
        const nextX = isChest ? p.x * (1.0 + step * 1.65) : p.x * (1.0 + step * 0.35);
        const nextY = Math.min(
          31.4 - LANYARD_SPECS.apexY,
          p.y * (1.0 + step * 0.55)
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

  // Final tensioned surface drape for torso: pull gently onto bust, then relax via Laplacian smoothing
  // interleaved with outward-only projection so the strap bridges hollows naturally with zero kinks or floating!
  if (placement === 'torso') {
    sampled = sampled.map((pt, i) => {
      if (i === 0 || i === sampled.length - 1) return pt.clone();
      const attachBlend = smoothstep(CRIMP_SPECS.topY + 0.1, CRIMP_SPECS.topY + 1.8, pt.y);
      if (attachBlend <= 1e-4) return pt.clone();
      const snapped = snapPointToTorsoSurface(pt, 0.145);
      return pt.clone().lerp(snapped, attachBlend);
    });

    const smoothPasses = 6;
    for (let pass = 0; pass < smoothPasses; pass++) {
      const next = sampled.map((p) => p.clone());
      for (let i = 1; i < sampled.length - 1; i++) {
        const avgX = 0.25 * sampled[i - 1].x + 0.5 * sampled[i].x + 0.25 * sampled[i + 1].x;
        const avgY = 0.25 * sampled[i - 1].y + 0.5 * sampled[i].y + 0.25 * sampled[i + 1].y;
        const avgZ = 0.25 * sampled[i - 1].z + 0.5 * sampled[i].z + 0.25 * sampled[i + 1].z;
        const relaxed = new THREE.Vector3(avgX, avgY, avgZ);
        if (relaxed.y > CRIMP_SPECS.topY + 0.2) {
          next[i] = projectPointOutsideTorso(relaxed, 0.145);
        } else {
          next[i] = relaxed;
        }
      }
      sampled = next;
    }
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

  // Smooth torso ribbon normals across neighboring rings (Gaussian relaxation) so the 2 cm webbing
  // flows naturally across collarbone & shoulder curvature with ZERO ripples or twisting!
  if (placement === 'torso') {
    for (let pass = 0; pass < 10; pass++) {
      const nextNormals = normals.map((n) => n.clone());
      for (let i = 1; i < N; i++) {
        const blended = normals[i - 1]
          .clone()
          .multiplyScalar(0.25)
          .addScaledVector(normals[i], 0.5)
          .addScaledVector(normals[i + 1], 0.25);
        const tVec = tangents[i];
        blended.addScaledVector(tVec, -blended.dot(tVec));
        if (blended.lengthSq() > 1e-8) {
          nextNormals[i] = blended.normalize();
        }
      }
      for (let i = 1; i < N; i++) {
        normals[i] = nextNormals[i];
        binormals[i] = new THREE.Vector3().crossVectors(tangents[i], normals[i]).normalize();
      }
    }
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

  // Precompute per-ring frames & smoothed outward torso clearance lift so EVERY single ribbon vertex
  // (including both outer edges & back face) stays strictly outside the linen bust with ZERO clipping!
  const ringCenters: THREE.Vector3[] = new Array(N + 1);
  const ringB: THREE.Vector3[] = new Array(N + 1);
  const ringN: THREE.Vector3[] = new Array(N + 1);
  const ringHalfW: number[] = new Array(N + 1);

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const center = spine[i].clone();
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

    // Keep full 2.0 cm polyester strap neatly seated inside the wide 2.12 cm matte-black stopper buckle slot
    // (subtle 0.94 -> 1.00 cm feathering instead of narrow cone pinch)
    const jawPinch = smoothstep(LANYARD_SPECS.apexY, CRIMP_SPECS.topY + 0.3, center.y);
    const localHalfW = THREE.MathUtils.lerp(0.92, halfW, jawPinch);

    ringCenters[i] = center;
    ringB[i] = twistedB.clone();
    ringN[i] = twistedN.clone();
    ringHalfW[i] = localHalfW;
  }

  if (placement === 'torso') {
    const minTargetClearance = 0.095;
    for (let corrPass = 0; corrPass < 3; corrPass++) {
      const lifts = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const center = ringCenters[i];
        if (center.y <= CRIMP_SPECS.topY + 0.12) continue;
        let minC = Infinity;
        for (let j = 0; j < P; j++) {
          const prof = profile[j];
          vertex
            .copy(center)
            .addScaledVector(ringB[i], prof.wNorm * ringHalfW[i])
            .addScaledVector(ringN[i], prof.th);
          const c = computeTorsoSignedClearance(vertex);
          if (c < minC) minC = c;
        }
        if (minC < minTargetClearance) {
          lifts[i] = minTargetClearance - minC;
        }
      }

      // Smooth upward envelope so lift transitions seamlessly along the webbing with zero bumps
      const smoothedLifts = new Float32Array(lifts);
      for (let sPass = 0; sPass < 4; sPass++) {
        const nextLifts = new Float32Array(smoothedLifts);
        for (let i = 1; i < N; i++) {
          const avg =
            0.25 * smoothedLifts[i - 1] + 0.5 * smoothedLifts[i] + 0.25 * smoothedLifts[i + 1];
          nextLifts[i] = Math.max(lifts[i], avg);
        }
        smoothedLifts.set(nextLifts);
      }

      let maxApplied = 0;
      for (let i = 0; i <= N; i++) {
        const l = smoothedLifts[i];
        if (l > 1e-4) {
          const outDir = getTorsoSurfaceNormal(ringCenters[i]);
          // Keep lift primarily horizontal-outward on chest & neck so Y drape stays stable
          outDir.y *= 0.35;
          outDir.normalize();
          ringCenters[i].addScaledVector(outDir, l);
          if (l > maxApplied) maxApplied = l;
        }
      }
      if (maxApplied < 0.002) break;
    }
  }

  for (let i = 0; i <= N; i++) {
    const center = ringCenters[i];
    const rB = ringB[i];
    const rN = ringN[i];
    const localHalfW = ringHalfW[i];
    const vCoord = cumulativeLengths[i] / LANYARD_SPECS.targetCircumference;

    for (let j = 0; j <= P; j++) {
      const prof = profile[j % P];
      vertex
        .copy(center)
        .addScaledVector(rB, prof.wNorm * localHalfW)
        .addScaledVector(rN, prof.th);

      // Strict physical containment inside matte-black stopper buckle top slot -> mathematically zero poke-through!
      if (vertex.y <= CRIMP_SPECS.topY + 0.02) {
        vertex.y = Math.max(CRIMP_SPECS.bottomY + 0.14, vertex.y);
        const maxInnerX = Math.max(0.2, getCrimpOuterHalfWidth(vertex.y) - 0.10);
        vertex.x = THREE.MathUtils.clamp(vertex.x, -maxInnerX, maxInnerX);
        const maxInnerZ = CRIMP_SPECS.halfDepthZ - 0.05;
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
