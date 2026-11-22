import * as THREE from 'three';
import type { CameraPresetId } from '../store/useStudioStore';
import { CARD_SPECS } from './cardGeometry';
import { CASE_SPECS } from './caseGeometry';

export type PlacementSceneId = 'studio' | 'table' | 'torso' | 'hanger';

export interface CameraPresetPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface AssemblyPlacementTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  /** Scale multiplier applied to pendulum & neck breathing sway (0 = resting flat on desk) */
  swayScale: number;
  /** Minimum allowable card X rotation (prevents card swinging backward into torso chest) */
  minCardPitchRad: number;
}

/** Shared metric specs (1 unit = 1 cm) for all placement environments */
export const PLACEMENT_SPECS = {
  table: {
    deskWidth: 78,
    deskDepth: 56,
    deskThickness: 2.8,
    deskTopY: 0,
    matWidth: 46,
    matDepth: 34,
    matThickness: 0.16,
    matTopY: 0.16,
    /** Resting CR80 card position on the desk mat (+Z is closer to viewer) */
    cardCenterX: -4.2,
    cardCenterZ: 6.8,
    /** Subtle right-opening editorial angle on the desk mat (radians) */
    cardYawRad: -0.14,
    /** Laptop footprint in world XZ for guaranteed collision-free lanyard layout */
    laptop: {
      x: -24.5,
      z: -18.5,
      yaw: 0.28,
      halfW: 13.0,
      halfD: 9.5,
    },
    espresso: {
      x: 24.2,
      z: -13.5,
      saucerRadius: 5.6,
    },
  },
  torso: {
    baseY: -22.0,
    topNeckY: 35.6,
    standFloorY: -40.0,
  },
  hanger: {
    /** Exact top wooden ridge center Y where the 80 cm lanyard sits flush on the walnut hanger */
    woodTopY: 47.05,
    woodBottomY: 42.8,
    woodHalfDepthZ: 0.62,
    shoulderSpanHalfX: 21.0,
    hookStemRadius: 0.22,
    railY: 55.0,
    railRadius: 0.95,
    rackHalfWidthX: 34.0,
    rackFloorY: -12.0,
  },
} as const;

export interface TorsoSliceProfile {
  y: number;
  centerZ: number;
  rx: number;
  rzFront: number;
  rzBack: number;
}

/**
 * Anatomical unisex tailor's mannequin bust cross-section profiles (1 unit = 1 cm).
 * Engineered so the front sternum sits flush at z ≈ -0.28 cm right behind the hanging ID card/case,
 * allowing both the badge and lanyard strap to rest directly on the tailored linen bust with zero floating gap.
 */
export const TORSO_PROFILES: readonly TorsoSliceProfile[] = [
  { y: -22.0, centerZ: -9.15, rx: 14.0, rzFront: 7.2, rzBack: 7.5 }, // Base waist rim
  { y: -16.5, centerZ: -9.05, rx: 14.8, rzFront: 7.9, rzBack: 7.9 }, // Lower waist
  { y: -10.5, centerZ: -8.98, rx: 16.0, rzFront: 8.5, rzBack: 8.2 }, // Mid torso
  { y: -3.5, centerZ: -9.05, rx: 17.8, rzFront: 8.75, rzBack: 8.4 }, // Lower sternum (front z = -0.30)
  { y: 2.5, centerZ: -9.13, rx: 19.2, rzFront: 8.85, rzBack: 8.5 }, // Card/sternum center (front z = -0.28)
  { y: 9.0, centerZ: -9.28, rx: 20.1, rzFront: 8.95, rzBack: 8.5 }, // Upper chest (front z = -0.33)
  { y: 14.5, centerZ: -9.55, rx: 20.4, rzFront: 8.45, rzBack: 8.25 }, // Upper pectoral
  { y: 18.5, centerZ: -9.82, rx: 19.8, rzFront: 7.65, rzBack: 7.75 }, // Rounded outer deltoid curve
  { y: 21.5, centerZ: -10.02, rx: 17.6, rzFront: 6.9, rzBack: 7.1 }, // Gentle shoulder slope
  { y: 24.0, centerZ: -10.12, rx: 14.0, rzFront: 6.3, rzBack: 6.5 }, // Upper shoulder taper
  { y: 26.2, centerZ: -10.08, rx: 9.8, rzFront: 5.85, rzBack: 6.1 }, // Collarbone / trapezius
  { y: 28.4, centerZ: -9.9, rx: 6.5, rzFront: 5.5, rzBack: 5.7 }, // Base of neck
  { y: 31.8, centerZ: -9.7, rx: 5.7, rzFront: 5.35, rzBack: 5.55 }, // Mid neck
  { y: 35.6, centerZ: -9.55, rx: 5.75, rzFront: 5.4, rzBack: 5.55 }, // Top neck collar rim
];

/**
 * Computes Fritsch-Carlson monotone cubic Hermite (PCHIP) tangents for a 1D profile array.
 * Guarantees C1 smoothness across all anatomical slices with ZERO washboard shelves or overshoot.
 */
function computePchipSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = Math.max(1e-6, xs[i + 1] - xs[i]);
    h.push(dx);
    delta.push((ys[i + 1] - ys[i]) / dx);
  }

  const m = new Array<number>(n).fill(0);
  // Interior slopes: weighted harmonic mean when adjacent secants share sign, else 0 (monotone)
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    } else {
      m[i] = 0;
    }
  }

  // Endpoint slopes (one-sided shape-preserving)
  m[0] = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
  if (m[0] * delta[0] <= 0) m[0] = 0;
  else if (Math.abs(m[0]) > 3 * Math.abs(delta[0])) m[0] = 3 * delta[0];

  m[n - 1] =
    ((2 * h[n - 2] + h[n - 3]) * delta[n - 2] - h[n - 2] * delta[n - 3]) /
    (h[n - 2] + h[n - 3]);
  if (m[n - 1] * delta[n - 2] <= 0) m[n - 1] = 0;
  else if (Math.abs(m[n - 1]) > 3 * Math.abs(delta[n - 2])) m[n - 1] = 3 * delta[n - 2];

  return m;
}

const TORSO_YS = TORSO_PROFILES.map((p) => p.y);
const TORSO_SLOPES = {
  centerZ: computePchipSlopes(
    TORSO_YS,
    TORSO_PROFILES.map((p) => p.centerZ)
  ),
  rx: computePchipSlopes(
    TORSO_YS,
    TORSO_PROFILES.map((p) => p.rx)
  ),
  rzFront: computePchipSlopes(
    TORSO_YS,
    TORSO_PROFILES.map((p) => p.rzFront)
  ),
  rzBack: computePchipSlopes(
    TORSO_YS,
    TORSO_PROFILES.map((p) => p.rzBack)
  ),
};

function evalCubicHermite(
  y0: number,
  y1: number,
  m0: number,
  m1: number,
  h: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

/** Evaluates C1-smooth monotone cubic Hermite (PCHIP) torso slice parameters at any height y (cm). */
export function sampleTorsoProfileAtY(y: number): TorsoSliceProfile {
  const profiles = TORSO_PROFILES;
  if (y <= profiles[0].y) return { ...profiles[0], y };
  if (y >= profiles[profiles.length - 1].y) return { ...profiles[profiles.length - 1], y };

  for (let i = 0; i < profiles.length - 1; i++) {
    const a = profiles[i];
    const b = profiles[i + 1];
    if (y >= a.y && y <= b.y) {
      const h = Math.max(1e-6, b.y - a.y);
      const t = (y - a.y) / h;
      return {
        y,
        centerZ: evalCubicHermite(
          a.centerZ,
          b.centerZ,
          TORSO_SLOPES.centerZ[i],
          TORSO_SLOPES.centerZ[i + 1],
          h,
          t
        ),
        rx: evalCubicHermite(a.rx, b.rx, TORSO_SLOPES.rx[i], TORSO_SLOPES.rx[i + 1], h, t),
        rzFront: evalCubicHermite(
          a.rzFront,
          b.rzFront,
          TORSO_SLOPES.rzFront[i],
          TORSO_SLOPES.rzFront[i + 1],
          h,
          t
        ),
        rzBack: evalCubicHermite(
          a.rzBack,
          b.rzBack,
          TORSO_SLOPES.rzBack[i],
          TORSO_SLOPES.rzBack[i + 1],
          h,
          t
        ),
      };
    }
  }
  return { ...profiles[profiles.length - 1], y };
}

function evaluateTorsoChestFactor(y: number, cosPhi: number, sinPhi: number): number {
  if (sinPhi >= 0 && y > -2 && y < 18) {
    return 1.0 - 0.045 * Math.exp(-Math.pow(cosPhi * 3.2, 2)) * Math.sin(((y + 2) / 20) * Math.PI);
  }
  return 1.0;
}

/**
 * Computes signed radial clearance (cm) from a 3D point to the exact sculpted torso bust surface
 * (including the sternum chest contour). Positive (> 0) means strictly outside the bust.
 */
export function computeTorsoSignedClearance(point: THREE.Vector3): number {
  if (point.y < PLACEMENT_SPECS.torso.baseY || point.y > PLACEMENT_SPECS.torso.topNeckY + 1.5) {
    return 10.0;
  }
  const prof = sampleTorsoProfileAtY(point.y);
  const dz = point.z - prof.centerZ;
  const rzBase = dz >= 0 ? prof.rzFront : prof.rzBack;
  const phi = Math.atan2(dz / Math.max(0.1, rzBase), point.x / Math.max(0.1, prof.rx));
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const cf = evaluateTorsoChestFactor(point.y, cosP, sinP);

  const surfX = cosP * prof.rx;
  const surfZ = prof.centerZ + sinP * rzBase * cf;
  const nx = cosP / Math.max(0.1, prof.rx);
  const nz = sinP / Math.max(0.1, rzBase * cf);
  const nLen = Math.hypot(nx, nz) || 1;
  return ((point.x - surfX) * nx + (point.z - surfZ) * nz) / nLen;
}

/**
 * Pushes any 3D point cleanly outside the torso bust ellipse by at least `minClearanceCm`.
 */
export function projectPointOutsideTorso(point: THREE.Vector3, minClearanceCm = 0.09): THREE.Vector3 {
  const out = point.clone();
  if (out.y < PLACEMENT_SPECS.torso.baseY || out.y > PLACEMENT_SPECS.torso.topNeckY + 0.5) {
    return out;
  }
  const clearance = computeTorsoSignedClearance(out);
  if (clearance < minClearanceCm) {
    return snapPointToTorsoSurface(out, minClearanceCm);
  }
  return out;
}

/**
 * Snaps a 3D point DIRECTLY ONTO the sculpted torso bust surface (at exact `surfaceOffsetCm`
 * outside the linen shell, whether the point was originally inside OR floating outside).
 * Uses the parametric ellipse angle so front chest & collarbone points stay neatly centered on the chest.
 */
export function snapPointToTorsoSurface(point: THREE.Vector3, surfaceOffsetCm = 0.095): THREE.Vector3 {
  const out = point.clone();
  const clampedY = THREE.MathUtils.clamp(out.y, PLACEMENT_SPECS.torso.baseY + 0.5, PLACEMENT_SPECS.torso.topNeckY - 0.5);
  const prof = sampleTorsoProfileAtY(clampedY);
  const dz = out.z - prof.centerZ;
  const rzBase = dz >= 0 ? prof.rzFront : prof.rzBack;
  const phi = Math.atan2(dz / Math.max(0.1, rzBase), out.x / Math.max(0.1, prof.rx));
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const chestFactor = evaluateTorsoChestFactor(clampedY, cosP, sinP);
  const surfX = cosP * prof.rx;
  const surfZ = prof.centerZ + sinP * rzBase * chestFactor;

  // Outward unit normal in the horizontal XZ slice
  const nx = cosP / Math.max(0.1, prof.rx);
  const nz = sinP / Math.max(0.1, rzBase * chestFactor);
  const nLen = Math.hypot(nx, nz) || 1;

  out.x = surfX + (nx / nLen) * surfaceOffsetCm;
  out.z = surfZ + (nz / nLen) * surfaceOffsetCm;
  return out;
}

/**
 * Computes the smooth outward 3D surface normal of the torso bust at `point`,
 * allowing the torso lanyard ribbon to lie completely flat against chest, collarbones, and neck.
 */
export function getTorsoSurfaceNormal(point: THREE.Vector3): THREE.Vector3 {
  const y = THREE.MathUtils.clamp(point.y, PLACEMENT_SPECS.torso.baseY + 0.5, PLACEMENT_SPECS.torso.topNeckY - 0.5);
  const prof = sampleTorsoProfileAtY(y);
  const dz = point.z - prof.centerZ;
  const rzBase = dz >= 0 ? prof.rzFront : prof.rzBack;
  const phi = Math.atan2(dz / Math.max(0.1, rzBase), point.x / Math.max(0.1, prof.rx));

  const evalSurf = (yy: number, th: number): THREE.Vector3 => {
    const p = sampleTorsoProfileAtY(yy);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const rzB = s >= 0 ? p.rzFront : p.rzBack;
    const cf = evaluateTorsoChestFactor(yy, c, s);
    return new THREE.Vector3(c * p.rx, yy, p.centerZ + s * rzB * cf);
  };

  const dTh = 0.02;
  const dY = 0.25;
  const pThPlus = evalSurf(y, phi + dTh);
  const pThMinus = evalSurf(y, phi - dTh);
  const pYPlus = evalSurf(Math.min(PLACEMENT_SPECS.torso.topNeckY, y + dY), phi);
  const pYMinus = evalSurf(Math.max(PLACEMENT_SPECS.torso.baseY, y - dY), phi);

  const tanTh = pThPlus.sub(pThMinus);
  const tanY = pYPlus.sub(pYMinus);
  const normal = new THREE.Vector3().crossVectors(tanY, tanTh);
  if (normal.lengthSq() < 1e-6) {
    return new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi)).normalize();
  }
  return normal.normalize();
}

/**
 * Evaluates exact top wood surface Y of the sculpted walnut coat hanger at horizontal coordinate x (cm).
 */
export function getHangerWoodTopY(x: number): number {
  const sX = PLACEMENT_SPECS.hanger.shoulderSpanHalfX;
  const nx = Math.min(1, Math.abs(x) / sX);
  const archY = 44.85 - 6.85 * Math.pow(nx, 1.55);
  const endCapScale = Math.sqrt(Math.max(0.001, 1.0 - Math.pow(nx, 16)));
  const notch = 1.0 - 0.14 * Math.exp(-Math.pow((nx - 0.72) / 0.032, 2));
  const halfH =
    (1.85 - 0.45 * Math.sin(nx * Math.PI) + 0.35 * Math.exp(-Math.pow(nx / 0.22, 2))) *
    notch *
    endCapScale;
  return archY + halfH;
}

/**
 * Tests whether a world-space point (wx, wz) intrudes into the rotated laptop footprint (plus margin).
 */
export function isPointInsideTableLaptopFootprint(wx: number, wz: number, marginCm = 0): boolean {
  const lap = PLACEMENT_SPECS.table.laptop;
  const dx = wx - lap.x;
  const dz = wz - lap.z;
  // Transform into laptop local frame (inverse Y rotation by -lap.yaw)
  const c = Math.cos(-lap.yaw);
  const s = Math.sin(-lap.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= lap.halfW + marginCm && Math.abs(lz) <= lap.halfD + marginCm;
}

/**
 * Computes world-space placement transform for the ID card + lanyard AssemblyRig.
 */
export function getAssemblyTransformForPlacement(
  placement: PlacementSceneId,
  cardCaseEnabled: boolean
): AssemblyPlacementTransform {
  if (placement === 'table') {
    const halfDepth = cardCaseEnabled ? CASE_SPECS.frameDepth / 2 : CARD_SPECS.thickness / 2;
    // Card lies strictly flat with front face (+Z in local) pointing straight UP (+Y in world).
    // In XYZ Euler order, R = Rx(-PI/2) * Rz(yaw) rotates horizontally in the desk XZ plane with zero roll!
    const restY = PLACEMENT_SPECS.table.matTopY + halfDepth + 0.03;
    return {
      position: [PLACEMENT_SPECS.table.cardCenterX, restY, PLACEMENT_SPECS.table.cardCenterZ],
      rotation: [-Math.PI / 2, 0, PLACEMENT_SPECS.table.cardYawRad],
      swayScale: 0,
      minCardPitchRad: 0,
    };
  }

  if (placement === 'torso') {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      // Minimal breathing sway so the lanyard and card remain visibly attached to the torso bust
      swayScale: 0.05,
      minCardPitchRad: -0.012,
    };
  }

  if (placement === 'hanger') {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      swayScale: 0.85,
      minCardPitchRad: -0.35,
    };
  }

  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    swayScale: 1.0,
    minCardPitchRad: -0.5,
  };
}

const CAMERA_POSES_BY_PLACEMENT: Record<PlacementSceneId, Record<CameraPresetId, CameraPresetPose>> = {
  studio: {
    full: { position: [14.0, 20.0, 95.0], target: [0, 19.2, 0] },
    front: { position: [4.2, 0.9, 20.6], target: [0, -0.2, 0] },
    back: { position: [-4.2, 0.9, -20.6], target: [0, -0.2, 0] },
    // Frames full iconic clasp assembly cleanly between top & bottom docks: case slot, teardrop lobster claw, O-ring, both rivets & stopper buckle
    macro: { position: [4.4, 8.6, 17.8], target: [0, 8.4, 0] },
  },
  table: {
    // Editorial 3/4 overhead studio desk shot framing card, right-swept curled lanyard, laptop, espresso cup & pen
    full: { position: [10.0, 45.0, 40.0], target: [0.5, 0.2, -1.5] },
    // Crisp near-overhead hero shot on the resting ID card & clasp
    front: { position: [-1.0, 22.0, 14.5], target: [-4.2, 0.2, 5.8] },
    // Low oblique table perspective showcasing PVC/case thickness & walnut grain
    back: { position: [-17.5, 12.5, 20.5], target: [-3.2, 0.4, 4.8] },
    // Close-up on the resting lobster clasp, O-ring, matte-black stopper buckle, and rivets on the felt mat
    macro: { position: [2.8, 10.2, 7.8], target: [-3.0, 0.35, -1.4] },
  },
  torso: {
    // Waist-up 3/4 portrait showing full walnut neck finial cleanly below top HUD bar & badge above bottom dock
    full: { position: [20.0, 22.0, 96.0], target: [0, 13.0, -6.0] },
    // Chest hero framing ID card resting against tailored torso
    front: { position: [5.2, 2.4, 24.0], target: [0, 0.6, -1.2] },
    // Rear 3/4 view inspecting how the lanyard curves around the back of the neck
    back: { position: [-22.0, 26.0, -48.0], target: [0, 18.0, -9.0] },
    // Clasp, O-ring, matte-black stopper buckle & chest collar macro
    macro: { position: [4.8, 8.8, 16.8], target: [0, 7.8, -0.6] },
  },
  hanger: {
    // Full vertical boutique rack showcase framing rail, full curved hook, walnut hanger, lanyard & badge cleanly above dock
    full: { position: [19.0, 29.5, 122.0], target: [0, 22.5, 0] },
    // Hero close-up on the hanging ID card with hanger visible above
    front: { position: [4.8, 1.5, 22.8], target: [0, 0.0, 0] },
    // Rear 180° shot inspecting back face (open-back boutique rack never blocks camera!)
    back: { position: [-4.8, 1.5, -22.8], target: [0, 0.0, 0] },
    // Close-up of the walnut coat hanger neck & lanyard drape around the steel hook
    macro: { position: [7.5, 46.9, 16.5], target: [0, 44.2, 0] },
  },
};

export function getPlacementCameraPose(
  placement: PlacementSceneId,
  preset: CameraPresetId,
  options: { isPortrait: boolean; cardCaseEnabled: boolean }
): CameraPresetPose {
  const base = CAMERA_POSES_BY_PLACEMENT[placement][preset];
  const { isPortrait, cardCaseEnabled } = options;

  const portraitScale = isPortrait ? (preset === 'full' ? 1.2 : 1.28) : 1.0;
  const isCaseCloseView =
    cardCaseEnabled &&
    placement !== 'table' &&
    (preset === 'front' || preset === 'back');
  const distScale = portraitScale * (isCaseCloseView ? 1.14 : 1.0);
  const posYOffset = isCaseCloseView ? -0.35 : 0;
  const targetYOffset = isCaseCloseView ? -0.75 : 0;

  // Scale offset relative to target so framing zooms cleanly around the focal point
  const dx = (base.position[0] - base.target[0]) * distScale;
  const dy = (base.position[1] - base.target[1]) * (placement === 'table' ? distScale : 1.0);
  const dz = (base.position[2] - base.target[2]) * distScale;

  return {
    position: [
      base.target[0] + dx,
      base.target[1] + dy + posYOffset,
      base.target[2] + dz,
    ],
    target: [base.target[0], base.target[1] + targetYOffset, base.target[2]],
  };
}

/**
 * Builds the smooth lofted tailor's mannequin torso bust BufferGeometry with subtle chest/collar
 * sculpting and clean cylindrical/planar UVs for fabric linen weave mapping.
 */
export function createTorsoBustGeometry(): THREE.BufferGeometry {
  const rings = 72;
  const radialSegs = 72;
  const yMin = PLACEMENT_SPECS.torso.baseY;
  const yMax = PLACEMENT_SPECS.torso.topNeckY;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = THREE.MathUtils.lerp(yMin, yMax, v);
    const prof = sampleTorsoProfileAtY(y);

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Subtle anatomical sculpting: slightly flatter sternum crease, gentle shoulder fullness
      const isFront = sinT >= 0;
      const rzBase = isFront ? prof.rzFront : prof.rzBack;
      const chestFactor =
        isFront && y > -2 && y < 18
          ? 1.0 - 0.045 * Math.exp(-Math.pow(cosT * 3.2, 2)) * Math.sin(((y + 2) / 20) * Math.PI)
          : 1.0;

      const x = cosT * prof.rx;
      const z = prof.centerZ + sinT * rzBase * chestFactor;

      positions.push(x, y, z);
      uvs.push(u * 4.0, v * 4.5);
    }
  }

  const stride = radialSegs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      // Outward-facing CCW winding: (b - a) = +Y, (d - a) = +theta (CW from +Y), so (+Y) x (+theta) points OUTWARD!
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Bottom cap (-Y normal) & top neck cap (+Y normal) so bust is watertight
  const addCap = (yCap: number, centerZ: number, rx: number, rzFront: number, rzBack: number, flip: boolean) => {
    const centerIdx = positions.length / 3;
    positions.push(0, yCap, centerZ);
    uvs.push(0.5, 0.5);
    const ringStart = positions.length / 3;
    for (let s = 0; s <= radialSegs; s++) {
      const theta = (s / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const rz = sinT >= 0 ? rzFront : rzBack;
      positions.push(cosT * rx, yCap, centerZ + sinT * rz);
      uvs.push(0.5 + cosT * 0.5, 0.5 + sinT * 0.5);
    }
    for (let s = 0; s < radialSegs; s++) {
      // Since increasing theta moves CW when viewed from +Y, (center, s+1, s) faces +Y (top) and (center, s, s+1) faces -Y (bottom)
      if (flip) {
        indices.push(centerIdx, ringStart + s, ringStart + s + 1);
      } else {
        indices.push(centerIdx, ringStart + s + 1, ringStart + s);
      }
    }
  };

  const bottomProf = TORSO_PROFILES[0];
  const topProf = TORSO_PROFILES[TORSO_PROFILES.length - 1];
  addCap(bottomProf.y, bottomProf.centerZ, bottomProf.rx, bottomProf.rzFront, bottomProf.rzBack, true);
  addCap(topProf.y, topProf.centerZ, topProf.rx, topProf.rzFront, topProf.rzBack, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds the composite sculpted walnut coat hanger + brushed-steel swivel hook geometries.
 */
export interface CoatHangerGeometries {
  woodBody: THREE.BufferGeometry;
  steelHook: THREE.BufferGeometry;
  ferruleCollar: THREE.BufferGeometry;
  dispose: () => void;
}

export function createCoatHangerGeometries(): CoatHangerGeometries {
  const { woodTopY, woodHalfDepthZ, shoulderSpanHalfX, railY } = PLACEMENT_SPECS.hanger;

  // 1. Smoothly lofted ergonomic walnut wishbone hanger body (zero flat-cap triangulation artifacts!)
  const sX = shoulderSpanHalfX; // 21 cm
  const slices = 84;
  const radialSegs = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const evalHangerCenter = (u: number): THREE.Vector3 => {
    const x = THREE.MathUtils.lerp(-sX, sX, u);
    const nx = Math.abs(x) / sX; // 0 at center neck, 1 at shoulder tips
    // Smooth wishbone arch peaking cleanly at center neck (y = 44.85), sloping gently to rounded tips (y = 38.0)
    const archY = 44.85 - 6.85 * Math.pow(nx, 1.55);
    // Tailored jacket forward sweep toward outer shoulders
    const sweepZ = 1.65 * Math.pow(Math.max(0, nx - 0.18) / 0.82, 2.0);
    return new THREE.Vector3(x, archY, sweepZ);
  };

  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= slices; i++) {
    centers.push(evalHangerCenter(i / slices));
  }

  for (let i = 0; i <= slices; i++) {
    const u = i / slices;
    const c = centers[i];
    const nx = Math.abs(c.x) / sX;

    // Tangent along wishbone spine
    const prev = centers[Math.max(0, i - 1)];
    const next = centers[Math.min(slices, i + 1)];
    const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
    const worldZ = new THREE.Vector3(0, 0, 1);
    const up = new THREE.Vector3().crossVectors(worldZ, tangent).normalize();
    const depthAxis = new THREE.Vector3().crossVectors(tangent, up).normalize();

    // Sculpted cross-section profile: fuller at center neck & outer jacket shoulders, tapered gently at ends
    const endCapScale = Math.sqrt(Math.max(0.001, 1.0 - Math.pow(nx, 16)));
    // Subtle carved dress-strap notch near nx = 0.72
    const notch = 1.0 - 0.14 * Math.exp(-Math.pow((nx - 0.72) / 0.032, 2));
    const halfH = (1.85 - 0.45 * Math.sin(nx * Math.PI) + 0.35 * Math.exp(-Math.pow(nx / 0.22, 2))) * notch * endCapScale;
    const halfD = (woodHalfDepthZ + 0.48 * Math.pow(nx, 1.8)) * endCapScale;

    for (let j = 0; j <= radialSegs; j++) {
      const v = j / radialSegs;
      const phi = v * Math.PI * 2;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      // Softly squared-oval superellipse cross-section for classic tailored wood hanger feel
      const sqCos = Math.sign(cosP) * Math.pow(Math.abs(cosP), 0.86);
      const sqSin = Math.sign(sinP) * Math.pow(Math.abs(sinP), 0.86);

      const px = c.x + up.x * (sqSin * halfH) + depthAxis.x * (sqCos * halfD);
      const py = c.y + up.y * (sqSin * halfH) + depthAxis.y * (sqCos * halfD);
      const pz = c.z + up.z * (sqSin * halfH) + depthAxis.z * (sqCos * halfD);

      positions.push(px, py, pz);
      uvs.push(u * 2.5, v);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const woodBody = new THREE.BufferGeometry();
  woodBody.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  woodBody.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  woodBody.setIndex(indices);
  woodBody.computeVertexNormals();
  woodBody.computeBoundingBox();
  woodBody.computeBoundingSphere();

  // 2. Brushed-steel coat hanger hook curving smoothly over the garment rail (rail at y = 50.6, r = 0.95)
  const hookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, woodTopY - 0.3, 0),
    new THREE.Vector3(0, woodTopY + 3.0, 0),
    new THREE.Vector3(0.0, railY - 1.4, 0),
    new THREE.Vector3(-1.35, railY + 0.55, 0),
    new THREE.Vector3(-0.35, railY + 1.85, 0),
    new THREE.Vector3(1.55, railY + 1.55, 0),
    new THREE.Vector3(2.25, railY + 0.15, 0),
    new THREE.Vector3(1.55, railY - 1.15, 0),
  ]);
  const steelHook = new THREE.TubeGeometry(hookCurve, 44, PLACEMENT_SPECS.hanger.hookStemRadius, 14, false);
  steelHook.computeVertexNormals();

  // 3. Turned brass ferrule collar seated flush where steel hook enters sculpted walnut crest
  const ferruleCollar = new THREE.CylinderGeometry(0.42, 0.56, 0.65, 20);
  ferruleCollar.translate(0, woodTopY + 0.18, 0);

  return {
    woodBody,
    steelHook,
    ferruleCollar,
    dispose: () => {
      woodBody.dispose();
      steelHook.dispose();
      ferruleCollar.dispose();
    },
  };
}

/**
 * Builds chamfered rounded-rect ExtrudeGeometry lying horizontally (XZ plane) with bottom at y = 0.
 */
export function createRoundedSlabGeometry(
  width: number,
  depth: number,
  height: number,
  cornerRadius: number,
  bevelSize = 0.12
): THREE.BufferGeometry {
  const hw = width / 2 - bevelSize;
  const hd = depth / 2 - bevelSize;
  const r = Math.min(cornerRadius, hw, hd);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  shape.closePath();

  const bevelT = Math.min(bevelSize, height * 0.35);
  const coreH = Math.max(0.02, height - bevelT * 2);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreH,
    bevelEnabled: true,
    bevelThickness: bevelT,
    bevelSize,
    bevelSegments: 3,
    curveSegments: 18,
  });
  // Extrude runs along +Z; rotate -90° around X so thickness runs along +Y, bottom at y = 0
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevelT, 0);

  // Normalize planar top-down UVs cleanly across slab width/depth
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + width / 2) / width, (pos.getZ(i) + depth / 2) / depth);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Builds composite ceramic espresso cup & saucer geometries (LatheGeometry + TubeGeometry handle)
 * grounded with bottom at y = 0.
 */
export function createEspressoCupGeometries(): {
  saucer: THREE.BufferGeometry;
  cup: THREE.BufferGeometry;
  handle: THREE.BufferGeometry;
  coffeeSurface: THREE.BufferGeometry;
  dispose: () => void;
} {
  const saucerPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(3.1, 0.0),
    new THREE.Vector2(3.6, 0.14),
    new THREE.Vector2(5.4, 0.58),
    new THREE.Vector2(5.55, 0.72),
    new THREE.Vector2(5.32, 0.8),
    new THREE.Vector2(3.4, 0.38),
    new THREE.Vector2(2.6, 0.28),
    new THREE.Vector2(0.0, 0.28),
  ];
  const saucer = new THREE.LatheGeometry(saucerPoints, 32);

  const cupPoints = [
    new THREE.Vector2(0.0, 0.3),
    new THREE.Vector2(2.35, 0.3),
    new THREE.Vector2(2.85, 0.8),
    new THREE.Vector2(3.4, 2.8),
    new THREE.Vector2(3.65, 5.2),
    new THREE.Vector2(3.7, 5.55),
    new THREE.Vector2(3.42, 5.62),
    new THREE.Vector2(3.26, 5.25),
    new THREE.Vector2(2.95, 2.6),
    new THREE.Vector2(2.1, 0.8),
    new THREE.Vector2(0.0, 0.75),
  ];
  const cup = new THREE.LatheGeometry(cupPoints, 32);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.45, 4.65, 0),
    new THREE.Vector3(4.95, 4.55, 0),
    new THREE.Vector3(5.2, 3.2, 0),
    new THREE.Vector3(4.5, 2.15, 0),
    new THREE.Vector3(3.1, 2.05, 0),
  ]);
  const handle = new THREE.TubeGeometry(handleCurve, 24, 0.34, 12, false);

  const coffeeSurface = new THREE.CircleGeometry(3.2, 28);
  coffeeSurface.rotateX(-Math.PI / 2);
  coffeeSurface.translate(0, 4.75, 0);

  return {
    saucer,
    cup,
    handle,
    coffeeSurface,
    dispose: () => {
      saucer.dispose();
      cup.dispose();
      handle.dispose();
      coffeeSurface.dispose();
    },
  };
}
