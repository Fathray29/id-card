import * as THREE from 'three';

/** Exact CR80 (ISO/IEC 7810 ID-1) vertical metric dimensions (1 unit = 1 cm) */
export const CARD_SPECS = {
  width: 5.4,
  height: 8.56,
  thickness: 0.076,
  cornerRadius: 0.318,
  bevelThickness: 0.008,
  bevelSize: 0.008,
  bevelSegments: 3,
  slotWidth: 1.4,
  slotHeight: 0.3,
  slotRadius: 0.15,
  slotCenterY: 8.56 / 2 - 0.5, // +3.78 cm
} as const;

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r);
  shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh);
  shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r);
  shape.absarc(-hw + r, -hh + r, r, Math.PI, (Math.PI * 3) / 2, false);
  shape.closePath();
  return shape;
}

function createSlotHolePath(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  radius: number
): THREE.Path {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  // Clockwise path for hole inside CCW outer shape
  const hole = new THREE.Path();
  hole.moveTo(centerX - hw + r, centerY + hh);
  hole.lineTo(centerX + hw - r, centerY + hh);
  hole.absarc(centerX + hw - r, centerY, r, Math.PI / 2, -Math.PI / 2, true);
  hole.lineTo(centerX - hw + r, centerY - hh);
  hole.absarc(centerX - hw + r, centerY, r, -Math.PI / 2, Math.PI / 2, true);
  hole.closePath();
  return hole;
}

/**
 * Builds the procedural vertical CR80 ID card ExtrudeGeometry (5.4 x 8.56 x 0.076 cm)
 * with pill-shaped slot punch at y = +3.78 cm, split into 3 clean material groups:
 *   Group 0: Front Face (normal.z > 0.5)   -> u = (x + W/2)/W, v = (y + H/2)/H
 *   Group 1: Back Face  (normal.z < -0.5)  -> u = 1 - (x + W/2)/W, v = (y + H/2)/H
 *   Group 2: PVC Edge & Bevels             -> wrapped edge UVs
 */
export function createCardGeometry(): THREE.BufferGeometry {
  const {
    width,
    height,
    thickness,
    cornerRadius,
    bevelThickness,
    bevelSize,
    bevelSegments,
    slotWidth,
    slotHeight,
    slotRadius,
    slotCenterY,
  } = CARD_SPECS;

  // Inset base profile by bevelSize so final beveled bounding box is exact 5.4 x 8.56 x 0.076 cm
  const coreWidth = width - bevelSize * 2;
  const coreHeight = height - bevelSize * 2;
  const coreRadius = Math.max(0.01, cornerRadius - bevelSize);
  const coreDepth = Math.max(0.01, thickness - bevelThickness * 2);

  const shape = createRoundedRectShape(coreWidth, coreHeight, coreRadius);

  // Expand hole slightly by bevelSize so the finished inner slot aperture is exact 1.4 x 0.3 cm
  const hole = createSlotHolePath(
    0,
    slotCenterY,
    slotWidth + bevelSize * 2,
    slotHeight + bevelSize * 2,
    slotRadius + bevelSize
  );
  shape.holes.push(hole);

  const rawGeo = new THREE.ExtrudeGeometry(shape, {
    depth: coreDepth,
    steps: 1,
    curveSegments: 24,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments,
  });

  // Center strictly around z = 0 (z in [-0.038, +0.038])
  rawGeo.translate(0, 0, -coreDepth / 2);

  // Ensure non-indexed for deterministic per-triangle group sorting
  const nonIndexed = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
  nonIndexed.computeVertexNormals();

  const posAttr = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = nonIndexed.getAttribute('normal') as THREE.BufferAttribute;
  const vertCount = posAttr.count;
  const triCount = Math.floor(vertCount / 3);

  const frontPos: number[] = [];
  const frontNorm: number[] = [];
  const frontUv: number[] = [];

  const backPos: number[] = [];
  const backNorm: number[] = [];
  const backUv: number[] = [];

  const edgePos: number[] = [];
  const edgeNorm: number[] = [];
  const edgeUv: number[] = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    vA.fromBufferAttribute(posAttr, i0);
    vB.fromBufferAttribute(posAttr, i1);
    vC.fromBufferAttribute(posAttr, i2);

    // Compute exact geometric face normal for reliable Front / Back / Edge classification
    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab).normalize();
    const faceNz = cb.z;

    const verts = [i0, i1, i2];

    if (faceNz > 0.5) {
      for (const idx of verts) {
        const x = posAttr.getX(idx);
        const y = posAttr.getY(idx);
        const z = posAttr.getZ(idx);
        frontPos.push(x, y, z);
        frontNorm.push(0, 0, 1);
        const u = THREE.MathUtils.clamp((x + width / 2) / width, 0, 1);
        const v = THREE.MathUtils.clamp((y + height / 2) / height, 0, 1);
        frontUv.push(u, v);
      }
    } else if (faceNz < -0.5) {
      for (const idx of verts) {
        const x = posAttr.getX(idx);
        const y = posAttr.getY(idx);
        const z = posAttr.getZ(idx);
        backPos.push(x, y, z);
        backNorm.push(0, 0, -1);
        // Horizontally mirrored so back text & barcodes read left-to-right when orbited 180 deg
        const u = THREE.MathUtils.clamp(1.0 - (x + width / 2) / width, 0, 1);
        const v = THREE.MathUtils.clamp((y + height / 2) / height, 0, 1);
        backUv.push(u, v);
      }
    } else {
      for (const idx of verts) {
        const x = posAttr.getX(idx);
        const y = posAttr.getY(idx);
        const z = posAttr.getZ(idx);
        edgePos.push(x, y, z);
        edgeNorm.push(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));
        const u = (x + y) * 0.25;
        const v = (z + thickness / 2) / thickness;
        edgeUv.push(u, v);
      }
    }
  }

  const finalGeo = new THREE.BufferGeometry();
  const totalPos = new Float32Array([...frontPos, ...backPos, ...edgePos]);
  const totalNorm = new Float32Array([...frontNorm, ...backNorm, ...edgeNorm]);
  const totalUv = new Float32Array([...frontUv, ...backUv, ...edgeUv]);

  finalGeo.setAttribute('position', new THREE.BufferAttribute(totalPos, 3));
  finalGeo.setAttribute('normal', new THREE.BufferAttribute(totalNorm, 3));
  finalGeo.setAttribute('uv', new THREE.BufferAttribute(totalUv, 2));

  const frontVerts = frontPos.length / 3;
  const backVerts = backPos.length / 3;
  const edgeVerts = edgePos.length / 3;

  finalGeo.clearGroups();
  finalGeo.addGroup(0, frontVerts, 0); // Group 0: Front
  finalGeo.addGroup(frontVerts, backVerts, 1); // Group 1: Back
  finalGeo.addGroup(frontVerts + backVerts, edgeVerts, 2); // Group 2: PVC Core Edge

  finalGeo.computeBoundingBox();
  finalGeo.computeBoundingSphere();

  rawGeo.dispose();
  if (nonIndexed !== rawGeo) nonIndexed.dispose();

  return finalGeo;
}

/**
 * Builds a matching flat CR80 face geometry with the slot punch cutout
 * for the Holographic Security Foil overlay, offset by +0.002 cm from the front cap.
 */
export function createHologramOverlayGeometry(): THREE.BufferGeometry {
  const { width, height, cornerRadius, slotWidth, slotHeight, slotRadius, slotCenterY, bevelSize } =
    CARD_SPECS;

  const shape = createRoundedRectShape(
    width - bevelSize * 2,
    height - bevelSize * 2,
    Math.max(0.01, cornerRadius - bevelSize)
  );
  const hole = createSlotHolePath(
    0,
    slotCenterY,
    slotWidth + bevelSize * 2,
    slotHeight + bevelSize * 2,
    slotRadius + bevelSize
  );
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape, 24);
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const uvArr = new Float32Array(posAttr.count * 2);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    uvArr[i * 2] = THREE.MathUtils.clamp((x + width / 2) / width, 0, 1);
    uvArr[i * 2 + 1] = THREE.MathUtils.clamp((y + height / 2) / height, 0, 1);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
