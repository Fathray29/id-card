import * as THREE from 'three';
import { CARD_SPECS } from './cardGeometry';

/**
 * Exact metric dimensions for the rigid 3D Vertical CR80 Protective Badge Case (1 unit = 1 cm).
 * Engineered so the case's molded top hanging tab places its 1.40 x 0.30 cm slot punch
 * at the EXACT same world Y (+3.78 cm) as a bare CR80 card — allowing the swivel lobster
 * clasp hook to seat snugly with zero gap and zero intersection.
 */
export const CASE_SPECS = {
  outerWidth: 6.16,
  outerCornerRadius: 0.48,
  /** Vertical drop applied to the enclosed CR80 card so the molded top lug sits cleanly above it */
  cardDropY: 1.04,
  frameTopY: 3.52,
  frameBottomY: -5.66,
  frameDepth: 0.32,
  windowWidth: 5.18,
  windowHeight: 8.34,
  windowCornerRadius: 0.24,
  headerTopY: 4.28, // Matches bare card top edge so clasp body clears by 0.10 cm
  headerSlotCenterY: CARD_SPECS.slotCenterY, // +3.78 cm — exact match with clasp hook saddle!
  headerThickness: 0.082, // Fits cleanly inside +/- 0.155 cm clasp hook loop
} as const;

export interface CardCaseGeometries {
  caseFrame: THREE.BufferGeometry;
  caseHeaderTab: THREE.BufferGeometry;
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
 * Builds the 3-part rigid CR80 badge holder / protective case:
 *  1. `caseFrame`: Chamfered outer protective bumper shell with recessed viewing window cutout
 *  2. `caseHeaderTab`: Molded upper hanging lug with exact 1.4 x 0.3 cm slot punch at y = +3.78 cm
 *  3. `caseWindowLens`: Dual front & back crystal-clear protective polycarbonate panes
 */
export function createCardCaseGeometries(): CardCaseGeometries {
  const halfOuterW = CASE_SPECS.outerWidth / 2;
  const frameShape = createRoundedRectShape(
    -halfOuterW,
    halfOuterW,
    CASE_SPECS.frameBottomY,
    CASE_SPECS.frameTopY,
    CASE_SPECS.outerCornerRadius
  );

  // Subtract clean front/back viewing window centered over the enclosed CR80 card (y = -cardDropY)
  const cardCenterY = -CASE_SPECS.cardDropY;
  const halfWinW = CASE_SPECS.windowWidth / 2;
  const halfWinH = CASE_SPECS.windowHeight / 2;
  const windowHole = createRoundedRectPath(
    -halfWinW,
    halfWinW,
    cardCenterY - halfWinH,
    cardCenterY + halfWinH,
    CASE_SPECS.windowCornerRadius
  );
  frameShape.holes.push(windowHole);

  const frameBevel = 0.045;
  const frameCoreDepth = CASE_SPECS.frameDepth - frameBevel * 2;
  const caseFrame = new THREE.ExtrudeGeometry(frameShape, {
    depth: frameCoreDepth,
    bevelEnabled: true,
    bevelThickness: frameBevel,
    bevelSize: 0.04,
    bevelSegments: 3,
    curveSegments: 20,
  });
  caseFrame.translate(0, 0, -frameCoreDepth / 2);
  caseFrame.computeVertexNormals();
  caseFrame.computeBoundingBox();

  // 2. Molded Top Hanging Lug (blends seamlessly into top edge of caseFrame at y = 3.42..4.28 cm)
  const tabShape = new THREE.Shape();
  const baseY = CASE_SPECS.frameTopY - 0.14;
  const topY = CASE_SPECS.headerTopY;
  tabShape.moveTo(-1.38, baseY);
  tabShape.lineTo(1.38, baseY);
  tabShape.quadraticCurveTo(1.26, topY - 0.22, 1.05, topY - 0.06);
  tabShape.quadraticCurveTo(0.96, topY, 0.80, topY);
  tabShape.lineTo(-0.80, topY);
  tabShape.quadraticCurveTo(-0.96, topY, -1.05, topY - 0.06);
  tabShape.quadraticCurveTo(-1.26, topY - 0.22, -1.38, baseY);
  tabShape.closePath();

  // Exact 1.40 x 0.30 cm rounded slot punch at y = +3.78 cm matching clasp hook saddle
  const halfSlotW = CARD_SPECS.slotWidth / 2;
  const halfSlotH = CARD_SPECS.slotHeight / 2;
  const slotPath = createRoundedRectPath(
    -halfSlotW,
    halfSlotW,
    CASE_SPECS.headerSlotCenterY - halfSlotH,
    CASE_SPECS.headerSlotCenterY + halfSlotH,
    CARD_SPECS.slotRadius
  );
  tabShape.holes.push(slotPath);

  const tabBevel = 0.012;
  const tabCoreDepth = CASE_SPECS.headerThickness - tabBevel * 2;
  const caseHeaderTab = new THREE.ExtrudeGeometry(tabShape, {
    depth: tabCoreDepth,
    bevelEnabled: true,
    bevelThickness: tabBevel,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 18,
  });
  caseHeaderTab.translate(0, 0, -tabCoreDepth / 2);
  caseHeaderTab.computeVertexNormals();
  caseHeaderTab.computeBoundingBox();

  // 3. Crystal-clear front & back protective polycarbonate window lens (positioned safely outside card +/-0.046 cm)
  const lensShape = createRoundedRectShape(
    -(halfWinW + 0.06),
    halfWinW + 0.06,
    cardCenterY - (halfWinH + 0.06),
    cardCenterY + (halfWinH + 0.06),
    CASE_SPECS.windowCornerRadius
  );
  const caseWindowLens = new THREE.ShapeGeometry(lensShape, 16);
  caseWindowLens.computeVertexNormals();
  caseWindowLens.computeBoundingBox();

  return {
    caseFrame,
    caseHeaderTab,
    caseWindowLens,
  };
}

export function disposeCardCaseGeometries(geos: CardCaseGeometries): void {
  geos.caseFrame.dispose();
  geos.caseHeaderTab.dispose();
  geos.caseWindowLens.dispose();
}
