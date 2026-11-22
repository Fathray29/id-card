import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARD_SPECS } from './cardGeometry';

/**
 * Exact metric dimensions for the rigid 3D Vertical CR80 Protective Badge Case (1 unit = 1 cm),
 * modeled directly after the classic crystal-clear injection-molded polycarbonate ID holder:
 *  - Full-width gently arched top dome header (y = 3.52..4.28 cm) with 3-hole punch pattern:
 *    center 1.40 x 0.30 cm slot at y = +3.78 cm flanked by twin circular side holes (r = 0.165 cm)
 *  - Crisp architectural outer rim with subtle corner radius (0.16 cm)
 *  - Raised horizontal top card-stop rib below the center slot
 *  - Symmetric stepped left & right side retaining grip rails
 *  - 4 subtle circular corner molding / ejector pin rings
 *  - Rigid back face with distinctive rounded-shield / D-shaped thumb-push cutout
 */
export const CASE_SPECS = {
  outerWidth: 6.18,
  outerCornerRadius: 0.16,
  /** Vertical drop applied to the enclosed CR80 card so the arched 3-hole header sits cleanly above it */
  cardDropY: 1.04,
  frameTopY: 3.52,
  frameBottomY: -5.66,
  frameDepth: 0.34,
  windowWidth: 5.52,
  windowHeight: 8.66,
  windowCornerRadius: 0.14,
  headerTopY: 4.28, // Exact match to bare card top edge so lobster clasp clears cleanly
  headerSlotCenterY: CARD_SPECS.slotCenterY, // +3.78 cm — exact match with clasp hook saddle
  headerSideHoleOffsetX: 1.26,
  headerSideHoleRadius: 0.165,
  headerThickness: 0.082, // Fits cleanly inside clasp hook clearance
  thumbCutoutCenterY: -3.52,
  thumbCutoutHalfW: 0.86,
  thumbCutoutHalfH: 0.90,
} as const;

export interface CardCaseGeometries {
  /** Outer perimeter protective wall framing the CR80 card */
  caseFrame: THREE.BufferGeometry;
  /** Full-width arched dome header with center slot + twin circular side holes */
  caseHeaderTab: THREE.BufferGeometry;
  /** Injection-molded structural details: top divider ridge, slot stop-rib, side grip rails, corner rings, rear thumb rim */
  caseMoldedDetails: THREE.BufferGeometry;
  /** Rigid back face pane featuring the rounded-shield / D-shaped thumb-push cutout */
  caseBackPlate: THREE.BufferGeometry;
  /** Crystal-clear front optical polycarbonate face pane */
  caseWindowLens: THREE.BufferGeometry;
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

function createRoundedRectPath(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  radius: number
): THREE.Path {
  const path = new THREE.Path();
  const r = Math.min(radius, (xMax - xMin) / 2, (yMax - yMin) / 2);

  path.moveTo(xMin + r, yMin);
  path.lineTo(xMax - r, yMin);
  path.quadraticCurveTo(xMax, yMin, xMax, yMin + r);
  path.lineTo(xMax, yMax - r);
  path.quadraticCurveTo(xMax, yMax, xMax - r, yMax);
  path.lineTo(xMin + r, yMax);
  path.quadraticCurveTo(xMin, yMax, xMin, yMax - r);
  path.lineTo(xMin, yMin + r);
  path.quadraticCurveTo(xMin, yMin, xMin + r, yMin);
  path.closePath();
  return path;
}

/**
 * Creates the distinctive rounded-shield / D-shaped thumb-slide cutout profile
 * seen in the lower back of rigid polycarbonate vertical ID holders:
 * softly curved flatter base, gently bowed vertical sides, and a full arched top.
 */
function traceThumbCutoutContour<T extends THREE.Path>(
  target: T,
  cx: number,
  cy: number,
  hw: number,
  hh: number
): T {
  const yBot = cy - hh;
  const yTop = cy + hh;
  const yShoulder = cy + hh * 0.14;
  const yLowCorner = yBot + hh * 0.24;

  // Start at bottom center, trace CCW
  target.moveTo(cx, yBot);
  // Gently curved bottom-right arc
  target.bezierCurveTo(cx + hw * 0.56, yBot, cx + hw * 0.94, yBot + hh * 0.08, cx + hw, yLowCorner);
  // Subtle right wall rising to shoulder
  target.bezierCurveTo(cx + hw * 1.03, cy - hh * 0.28, cx + hw * 1.02, cy - hh * 0.04, cx + hw * 0.96, yShoulder);
  // Rounded arched top dome
  target.bezierCurveTo(cx + hw * 0.84, yTop - hh * 0.12, cx + hw * 0.44, yTop, cx, yTop);
  target.bezierCurveTo(cx - hw * 0.44, yTop, cx - hw * 0.84, yTop - hh * 0.12, cx - hw * 0.96, yShoulder);
  // Subtle left wall descending to lower corner
  target.bezierCurveTo(cx - hw * 1.02, cy - hh * 0.04, cx - hw * 1.03, cy - hh * 0.28, cx - hw, yLowCorner);
  // Gently curved bottom-left arc back to bottom center
  target.bezierCurveTo(cx - hw * 0.94, yBot + hh * 0.08, cx - hw * 0.56, yBot, cx, yBot);
  target.closePath();
  return target;
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

/**
 * Builds the 5-part injection-molded rigid CR80 vertical polycarbonate badge case:
 *  1. `caseFrame`: Crisp chamfered perimeter housing wall surrounding the CR80 card pocket
 *  2. `caseHeaderTab`: Full-width gently arched top dome with center 1.4x0.3 cm slot + 2 circular side holes
 *  3. `caseMoldedDetails`: Horizontal top divider & stop-rib, left/right stepped retaining rails, 4 corner rings, rear thumb rim
 *  4. `caseBackPlate`: Rigid rear face with authentic rounded-shield thumb-push cutout
 *  5. `caseWindowLens`: Crystal-clear optical front polycarbonate face
 */
export function createCardCaseGeometries(): CardCaseGeometries {
  const halfOuterW = CASE_SPECS.outerWidth / 2;
  const cardCenterY = -CASE_SPECS.cardDropY;
  const halfWinW = CASE_SPECS.windowWidth / 2;
  const halfWinH = CASE_SPECS.windowHeight / 2;

  // 1. Crisp Outer Perimeter Rim Wall (y = -5.66 .. +3.52 cm)
  const frameShape = createRoundedRectShape(
    -halfOuterW,
    halfOuterW,
    CASE_SPECS.frameBottomY,
    CASE_SPECS.frameTopY,
    CASE_SPECS.outerCornerRadius
  );
  const windowHole = createRoundedRectPath(
    -halfWinW,
    halfWinW,
    cardCenterY - halfWinH,
    cardCenterY + halfWinH,
    CASE_SPECS.windowCornerRadius
  );
  frameShape.holes.push(windowHole);

  const frameBevel = 0.032;
  const frameCoreDepth = CASE_SPECS.frameDepth - frameBevel * 2;
  const caseFrame = new THREE.ExtrudeGeometry(frameShape, {
    depth: frameCoreDepth,
    bevelEnabled: true,
    bevelThickness: frameBevel,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 20,
  });
  caseFrame.translate(0, 0, -frameCoreDepth / 2);
  caseFrame.computeVertexNormals();
  caseFrame.computeBoundingBox();

  // 2. Full-Width Gently Arched Dome Header (spans full width [-halfOuterW, +halfOuterW], peaks at y = 4.28 cm)
  const shoulderY = CASE_SPECS.frameTopY - 0.04;
  const peakY = CASE_SPECS.headerTopY;
  const domeControlY = peakY + (peakY - shoulderY) * 0.96; // Exact quadratic peak at (0, peakY)
  // Solve quadratic Bezier y(0.5) = 0.25*y0 + 0.5*yc + 0.25*y2 = peakY => yc = 2*peakY - shoulderY
  const exactControlY = 2 * peakY - shoulderY;

  const headerShape = new THREE.Shape();
  headerShape.moveTo(-halfOuterW + 0.02, shoulderY - 0.06);
  headerShape.lineTo(halfOuterW - 0.02, shoulderY - 0.06);
  headerShape.lineTo(halfOuterW - 0.02, shoulderY);
  headerShape.quadraticCurveTo(0, exactControlY, -halfOuterW + 0.02, shoulderY);
  headerShape.closePath();
  void domeControlY;

  // Hole A: Center elongated rounded-rectangle slot (1.40 x 0.30 cm at y = +3.78 cm)
  const halfSlotW = CARD_SPECS.slotWidth / 2;
  const halfSlotH = CARD_SPECS.slotHeight / 2;
  const centerSlot = createRoundedRectPath(
    -halfSlotW,
    halfSlotW,
    CASE_SPECS.headerSlotCenterY - halfSlotH,
    CASE_SPECS.headerSlotCenterY + halfSlotH,
    CARD_SPECS.slotRadius
  );
  headerShape.holes.push(centerSlot);

  // Hole B & C: Left & Right circular side holes flanking the center slot
  for (const side of [-1, 1]) {
    const holePath = new THREE.Path();
    holePath.absarc(
      side * CASE_SPECS.headerSideHoleOffsetX,
      CASE_SPECS.headerSlotCenterY,
      CASE_SPECS.headerSideHoleRadius,
      0,
      Math.PI * 2,
      false
    );
    headerShape.holes.push(holePath);
  }

  const headerBevel = 0.012;
  const headerCoreDepth = CASE_SPECS.headerThickness - headerBevel * 2;
  const caseHeaderTab = new THREE.ExtrudeGeometry(headerShape, {
    depth: headerCoreDepth,
    bevelEnabled: true,
    bevelThickness: headerBevel,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 28,
  });
  caseHeaderTab.translate(0, 0, -headerCoreDepth / 2);
  caseHeaderTab.computeVertexNormals();
  caseHeaderTab.computeBoundingBox();

  // 3. Injection-Molded Secondary Structural Details (matching reference polycarbonate ridges & rails)
  const detailParts: THREE.BufferGeometry[] = [];

  // 3a. Crisp horizontal shoulder seam ridge separating dome header from card pocket
  const shoulderBarShape = createRoundedRectShape(
    -halfOuterW + 0.05,
    halfOuterW - 0.05,
    CASE_SPECS.frameTopY - 0.08,
    CASE_SPECS.frameTopY + 0.06,
    0.05
  );
  const shoulderBar = new THREE.ExtrudeGeometry(shoulderBarShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 10,
  });
  shoulderBar.translate(0, 0, -0.12);
  detailParts.push(normalizeForMerge(shoulderBar));

  // 3b. Raised arched outer lip rim tracing the perimeter of the dome header (catches crisp studio rim highlights while clearing clasp hook)
  const domeRimOuter = new THREE.Shape();
  domeRimOuter.moveTo(-halfOuterW + 0.01, shoulderY);
  domeRimOuter.quadraticCurveTo(0, exactControlY + 0.01, halfOuterW - 0.01, shoulderY);
  domeRimOuter.lineTo(halfOuterW - 0.14, shoulderY);
  domeRimOuter.quadraticCurveTo(0, exactControlY - 0.16, -halfOuterW + 0.14, shoulderY);
  domeRimOuter.closePath();
  const domeRim = new THREE.ExtrudeGeometry(domeRimOuter, {
    depth: 0.092,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 28,
  });
  domeRim.translate(0, 0, -0.046);
  detailParts.push(normalizeForMerge(domeRim));

  // 3c. Iconic raised horizontal card-stop rib right below the center slot and above the enclosed CR80 card (y = 3.26..3.44 cm)
  const stopRibShape = createRoundedRectShape(-1.12, 1.12, 3.26, 3.44, 0.08);
  const stopRib = new THREE.ExtrudeGeometry(stopRibShape, {
    depth: 0.30,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.016,
    bevelSegments: 2,
    curveSegments: 12,
  });
  stopRib.translate(0, 0, -0.15);
  detailParts.push(normalizeForMerge(stopRib));

  // 3d. Symmetric left & right stepped side retaining / grip rail flanges hugging the outer perimeter edge
  for (const side of [-1, 1]) {
    const xInner = side > 0 ? halfOuterW - 0.30 : -halfOuterW + 0.04;
    const xOuter = side > 0 ? halfOuterW - 0.04 : -halfOuterW + 0.30;
    const railShape = createRoundedRectShape(xInner, xOuter, -3.05, 1.05, 0.075);
    const railGeo = new THREE.ExtrudeGeometry(railShape, {
      depth: CASE_SPECS.frameDepth + 0.015,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.014,
      bevelSegments: 2,
      curveSegments: 12,
    });
    railGeo.translate(0, 0, -(CASE_SPECS.frameDepth + 0.015) / 2);
    detailParts.push(normalizeForMerge(railGeo));
  }

  // 3e. Subtle molded inner corner ejector-pin rings (4 corners, front & back)
  const cornerCoords: Array<[number, number]> = [
    [-2.54, 2.94],
    [2.54, 2.94],
    [-2.54, -5.06],
    [2.54, -5.06],
  ];
  for (const [cx, cy] of cornerCoords) {
    for (const zSign of [-1, 1]) {
      const ring = new THREE.TorusGeometry(0.145, 0.022, 8, 18);
      ring.translate(cx, cy, zSign * 0.145);
      detailParts.push(normalizeForMerge(ring));
    }
  }

  // 3f. Raised beveled rim outlining the rear rounded-shield thumb-push cutout (catches bright edge glints!)
  const thumbOuterShape = traceThumbCutoutContour(
    new THREE.Shape(),
    0,
    CASE_SPECS.thumbCutoutCenterY,
    CASE_SPECS.thumbCutoutHalfW + 0.075,
    CASE_SPECS.thumbCutoutHalfH + 0.075
  );
  const thumbInnerHole = traceThumbCutoutContour(
    new THREE.Path(),
    0,
    CASE_SPECS.thumbCutoutCenterY,
    CASE_SPECS.thumbCutoutHalfW,
    CASE_SPECS.thumbCutoutHalfH
  );
  thumbOuterShape.holes.push(thumbInnerHole);
  const thumbRimGeo = new THREE.ExtrudeGeometry(thumbOuterShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 24,
  });
  thumbRimGeo.translate(0, 0, -0.165);
  detailParts.push(normalizeForMerge(thumbRimGeo));

  const mergedDetails = mergeGeometries(detailParts, false);
  for (const part of detailParts) part.dispose();
  if (!mergedDetails) {
    throw new Error('Failed to merge molded card case detail geometries');
  }
  mergedDetails.computeVertexNormals();
  mergedDetails.computeBoundingBox();

  // 4. Rigid Back Plate with Authentic Rounded-Shield Thumb-Push Cutout
  const backShape = createRoundedRectShape(
    -(halfWinW + 0.12),
    halfWinW + 0.12,
    cardCenterY - (halfWinH + 0.12),
    cardCenterY + (halfWinH + 0.12),
    CASE_SPECS.windowCornerRadius
  );
  const backThumbHole = traceThumbCutoutContour(
    new THREE.Path(),
    0,
    CASE_SPECS.thumbCutoutCenterY,
    CASE_SPECS.thumbCutoutHalfW,
    CASE_SPECS.thumbCutoutHalfH
  );
  backShape.holes.push(backThumbHole);
  const caseBackPlate = new THREE.ExtrudeGeometry(backShape, {
    depth: 0.042,
    bevelEnabled: false,
    curveSegments: 24,
  });
  caseBackPlate.translate(0, 0, -0.155);
  caseBackPlate.computeVertexNormals();
  caseBackPlate.computeBoundingBox();

  // 5. Crystal-Clear Front Optical Polycarbonate Window Pane
  const lensShape = createRoundedRectShape(
    -(halfWinW + 0.08),
    halfWinW + 0.08,
    cardCenterY - (halfWinH + 0.08),
    cardCenterY + (halfWinH + 0.08),
    CASE_SPECS.windowCornerRadius
  );
  const caseWindowLens = new THREE.ShapeGeometry(lensShape, 16);
  caseWindowLens.translate(0, 0, 0.14);
  caseWindowLens.computeVertexNormals();
  caseWindowLens.computeBoundingBox();

  return {
    caseFrame,
    caseHeaderTab,
    caseMoldedDetails: mergedDetails,
    caseBackPlate,
    caseWindowLens,
  };
}

export function disposeCardCaseGeometries(geos: CardCaseGeometries): void {
  geos.caseFrame.dispose();
  geos.caseHeaderTab.dispose();
  geos.caseMoldedDetails.dispose();
  geos.caseBackPlate.dispose();
  geos.caseWindowLens.dispose();
}
