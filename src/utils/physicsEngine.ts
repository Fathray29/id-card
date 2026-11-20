/**
 * Pure, deterministic physics & Hermite-spline cinematic camera choreography module
 * for the ID card + lanyard rig. Decoupled from Three.js/React so it can be stepped
 * identically during live preview and offline 60fps frame-by-frame rendering, and unit-tested directly.
 */

export type AnimationPreset =
  | 'cinematic-reel'
  | 'cinematic-360'
  | 'turntable'
  | 'pendulum-flip'
  | 'parallax-sway';

export type VideoDurationSec = 12 | 16 | 20 | 24;

export type ExportAspectRatio = '16:9' | '9:16' | '1:1';

export const EXPORT_RESOLUTIONS: Record<
  ExportAspectRatio,
  { width: number; height: number; label: string; shortLabel: string }
> = {
  '16:9': { width: 1920, height: 1080, label: '16:9 Widescreen (1920×1080)', shortLabel: '16:9 HD' },
  '9:16': { width: 1080, height: 1920, label: '9:16 Mobile Reel (1080×1920)', shortLabel: '9:16 Reel' },
  '1:1': { width: 1080, height: 1080, label: '1:1 Square Social (1080×1080)', shortLabel: '1:1 Square' },
};

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface CameraKeyframePose {
  position: Vec3Tuple;
  target: Vec3Tuple;
  fov: number;
  /** Current human-readable shot label for preview HUD / testing */
  shotName: 'Full' | 'Front' | 'Back' | 'Macro Top' | 'Macro Bottom' | '360° Showcase';
}

export interface SpringState {
  /** Card + swivel clasp Y-axis flip / spin angle (radians) */
  thetaY: number;
  omegaY: number;
  /** Card X-axis pitch swing (radians) */
  thetaX: number;
  omegaX: number;
  /** Card Z-axis roll pendulum sway (radians) */
  thetaZ: number;
  omegaZ: number;
  /** Top neck pivot breathing sway (radians) */
  neckSwayZ: number;
  neckSwayX: number;
  /** Whole-rig turntable angle (radians) */
  turntableY: number;
  /** Accumulated simulation clock (seconds) */
  simTime: number;
  /** Optional choreographed camera pose driven by Hermite spline presets */
  cameraPose: CameraKeyframePose | null;
}

export interface SpringParams {
  stiffnessY: number;
  dampingY: number;
  stiffnessSwing: number;
  dampingSwing: number;
}

export const DEFAULT_SPRING_PARAMS: SpringParams = {
  stiffnessY: 42.0,
  dampingY: 11.2,
  stiffnessSwing: 26.0,
  dampingSwing: 8.6,
};

export function createInitialSpringState(): SpringState {
  return {
    thetaY: 0,
    omegaY: 0,
    thetaX: 0,
    omegaX: 0,
    thetaZ: 0,
    omegaZ: 0,
    neckSwayZ: 0,
    neckSwayX: 0,
    turntableY: 0,
    simTime: 0,
    cameraPose: null,
  };
}

/**
 * Critically damped harmonic oscillator integration step:
 *   alpha = -k * (theta - thetaTarget) - c * omega
 */
export function stepOscillator(
  theta: number,
  omega: number,
  target: number,
  k: number,
  c: number,
  dt: number
): { theta: number; omega: number } {
  const safeDt = Math.max(0, Math.min(dt, 0.05));
  const subSteps = 4;
  const h = safeDt / subSteps;
  let pos = theta;
  let vel = omega;

  for (let i = 0; i < subSteps; i++) {
    const accel = -k * (pos - target) - c * vel;
    vel += accel * h;
    pos += vel * h;
  }

  return { theta: pos, omega: vel };
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOutSine(t: number): number {
  const c = clamp01(t);
  return -(Math.cos(Math.PI * c) - 1) / 2;
}

export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * C2-continuous Quintic Smootherstep ease-in-out polynomial:
 *   f(t) = 6t^5 - 15t^4 + 10t^3
 * Unlike piecewise 16t^5 (which spikes to 5.0x speed at midpoint causing whip-pans),
 * quintic smootherstep maintains zero velocity AND zero acceleration at both ends
 * with a gentle 1.875x peak slope for slow, luxurious studio camera motion.
 */
export function easeInOutQuint(t: number): number {
  const c = clamp01(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * Blended cinema dolly easing (65% C2 quintic smootherstep + 35% sine ease):
 * guarantees zero-jerk starts/stops and ultra-low peak velocity (~1.76x) with zero whip!
 */
export function easeCinemaDolly(t: number): number {
  const c = clamp01(t);
  return easeInOutQuint(c) * 0.65 + easeInOutSine(c) * 0.35;
}

/**
 * Cubic Hermite Spline evaluation between endpoints (p0, p1) with tangents (m0, m1) at parameter u in [0, 1]:
 *   H(u) = (2u^3 - 3u^2 + 1) p0 + (u^3 - 2u^2 + u) m0 + (-2u^3 + 3u^2) p1 + (u^3 - u^2) m1
 */
export function cubicHermite(
  p0: number,
  m0: number,
  p1: number,
  m1: number,
  u: number
): number {
  const t = clamp01(u);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

/** Orbital camera waypoint along the continuous global Hermite spline path */
interface OrbitalWaypoint {
  t: number;
  azimuthDeg: number; // Strictly monotonic negative: +18° -> ... -> -342° (exact 360° wrap, zero reversals!)
  radius: number; // Horizontal XZ distance from target (cm)
  camY: number; // Camera height (cm)
  targetY: number; // Look-at height (cm)
  fov: number;
  shotName: CameraKeyframePose['shotName'];
}

/**
 * Seamless, Zero-Hiccup 5-Act Continuous Global Spline Path:
 *  - Strictly monotonic azimuth (+18° -> -342°) eliminates direction reversals & snap kinks.
 *  - Waypoints are spatially denser during hero showcases (Front, Back, Macro) and wider across
 *    transitions, so the global C1 Fritsch-Butland (PCHIP) Hermite spline naturally glides smoothly
 *    into each hero shot and accelerates gracefully into sweeping transitions with ZERO dead-stops
 *    or inter-scene hiccups from frame 0 to the final frame.
 */
const CINEMATIC_REEL_WAYPOINTS: OrbitalWaypoint[] = [
  // Act 1 (0.00 -> 0.13): Full Establishing Drift (entire 80cm lanyard + badge framed cleanly)
  { t: 0.0, azimuthDeg: 18, radius: 84.0, camY: 17.5, targetY: 16.5, fov: 36.0, shotName: 'Full' },
  { t: 0.13, azimuthDeg: 10, radius: 74.0, camY: 15.4, targetY: 14.4, fov: 35.4, shotName: 'Full' },

  // Seamless Push-In (15%) -> Act 2 (0.28 -> 0.39): Front Hero Showcase Sweep
  { t: 0.28, azimuthDeg: 6, radius: 21.4, camY: 1.15, targetY: 0.0, fov: 34.0, shotName: 'Front' },
  { t: 0.39, azimuthDeg: -10, radius: 20.6, camY: 0.7, targetY: -0.2, fov: 33.8, shotName: 'Front' },

  // Seamless 180° Orbital Sweep (14%) -> Act 3 (0.53 -> 0.64): Back Hero Showcase Sweep
  { t: 0.53, azimuthDeg: -168, radius: 21.4, camY: 1.05, targetY: 0.0, fov: 34.0, shotName: 'Back' },
  { t: 0.64, azimuthDeg: -192, radius: 20.6, camY: 0.65, targetY: -0.2, fov: 33.8, shotName: 'Back' },

  // Seamless Arc into Macro (12%) -> Act 4 (0.76 -> 0.86): Macro Crane Tilt (Top: Weave/Clasp -> Bottom: Card Detail)
  { t: 0.76, azimuthDeg: -334, radius: 9.4, camY: 7.0, targetY: 6.0, fov: 32.0, shotName: 'Macro Top' },
  { t: 0.86, azimuthDeg: -339, radius: 11.2, camY: -2.2, targetY: -2.6, fov: 32.2, shotName: 'Macro Bottom' },

  // Seamless Silky Pull-Back (14%) Returning to Exact Starting Pose (+18° === -342° mod 360°)
  { t: 1.0, azimuthDeg: -342, radius: 84.0, camY: 17.5, targetY: 16.5, fov: 36.0, shotName: 'Full' },
];

type NumericChannel = 'azimuthDeg' | 'radius' | 'camY' | 'targetY' | 'fov';

/**
 * Computes global C1-continuous Fritsch-Butland (PCHIP) monotone Hermite velocity slopes `dv/du`
 * for every waypoint along a channel.
 *  - Guarantees ZERO velocity discontinuities (hiccups) between scenes!
 *  - Guarantees ZERO overshoot at local extrema (e.g. tight macro radius never clips the card).
 *  - When `periodic = true`, wraps slope seamlessly across `t = 1.0 -> t = 0.0` for endless looping.
 */
function computeGlobalHermiteSlopes(
  waypoints: OrbitalWaypoint[],
  channel: NumericChannel,
  periodic: boolean
): number[] {
  const n = waypoints.length;
  const segCount = n - 1;
  const dts: number[] = new Array(segCount);
  const secants: number[] = new Array(segCount);

  for (let i = 0; i < segCount; i++) {
    const dt = Math.max(1e-6, waypoints[i + 1].t - waypoints[i].t);
    dts[i] = dt;
    secants[i] = (waypoints[i + 1][channel] - waypoints[i][channel]) / dt;
  }

  const slopes: number[] = new Array(n).fill(0);

  const pchipSlope = (dtPrev: number, sPrev: number, dtNext: number, sNext: number): number => {
    if (sPrev * sNext <= 0) {
      // Smoothly pass through zero velocity at local extremum (zero overshoot)
      return 0;
    }
    const w1 = 2 * dtNext + dtPrev;
    const w2 = dtNext + 2 * dtPrev;
    return (w1 + w2) / (w1 / sPrev + w2 / sNext);
  };

  for (let i = 1; i < n - 1; i++) {
    slopes[i] = pchipSlope(dts[i - 1], secants[i - 1], dts[i], secants[i]);
  }

  if (periodic) {
    // Periodic wrap-around: match velocity identically at u = 0 and u = 1
    const boundarySlope = pchipSlope(
      dts[segCount - 1],
      secants[segCount - 1],
      dts[0],
      secants[0]
    );
    slopes[0] = boundarySlope;
    slopes[n - 1] = boundarySlope;
  } else {
    // Clamped C1 zero-velocity endpoints for seamless handoff into Phase 2 (360° turntable)
    slopes[0] = 0;
    slopes[n - 1] = 0;
  }

  return slopes;
}

const PERIODIC_SLOPES: Record<NumericChannel, number[]> = {
  azimuthDeg: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'azimuthDeg', true),
  radius: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'radius', true),
  camY: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'camY', true),
  targetY: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'targetY', true),
  fov: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'fov', true),
};

const CLAMPED_SLOPES: Record<NumericChannel, number[]> = {
  azimuthDeg: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'azimuthDeg', false),
  radius: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'radius', false),
  camY: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'camY', false),
  targetY: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'targetY', false),
  fov: computeGlobalHermiteSlopes(CINEMATIC_REEL_WAYPOINTS, 'fov', false),
};

/**
 * Wraps normalized progress seamlessly into [0, 1) for periodic curves,
 * allowing negative/overflow sub-frame temporal motion blur offsets around frame 0 & N-1.
 */
function wrapProgress01(p: number): number {
  const mod = p % 1;
  return mod < 0 ? mod + 1 : mod;
}

/**
 * Evaluates a continuous, zero-hiccup global C1 PCHIP Cubic Hermite Spline camera pose
 * at normalized progress `u`.
 *  - `periodic = true` (default): continuous velocity across every scene AND across loop seam 1.0 -> 0.0.
 *  - `periodic = false`: smooth zero-velocity ease at u=0 and u=1 for seamless handoff into 360° phase.
 */
export function evaluateHermiteCameraPath(
  progress: number,
  aspect = 16 / 9,
  periodic = true
): CameraKeyframePose {
  const u = periodic ? (progress === 1 ? 1 : wrapProgress01(progress)) : clamp01(progress);
  const slopeTable = periodic ? PERIODIC_SLOPES : CLAMPED_SLOPES;

  let idx = CINEMATIC_REEL_WAYPOINTS.length - 2;
  for (let i = 0; i < CINEMATIC_REEL_WAYPOINTS.length - 1; i++) {
    if (u >= CINEMATIC_REEL_WAYPOINTS[i].t && u <= CINEMATIC_REEL_WAYPOINTS[i + 1].t) {
      idx = i;
      break;
    }
  }

  const w0 = CINEMATIC_REEL_WAYPOINTS[idx];
  const w1 = CINEMATIC_REEL_WAYPOINTS[idx + 1];
  const dt = Math.max(1e-6, w1.t - w0.t);
  // Linear local parameter preserves exact global C1 velocity continuity across every waypoint!
  const localT = clamp01((u - w0.t) / dt);

  const sampleChannel = (ch: NumericChannel): number => {
    const m0 = slopeTable[ch][idx] * dt;
    const m1 = slopeTable[ch][idx + 1] * dt;
    return cubicHermite(w0[ch], m0, w1[ch], m1, localT);
  };

  const azDeg = sampleChannel('azimuthDeg');
  const azRad = (azDeg * Math.PI) / 180;

  // Portrait / mobile framing compensation
  const portraitBoost = aspect < 0.85 ? 1.24 : aspect < 1.15 ? 1.08 : 1.0;
  const radius = sampleChannel('radius') * portraitBoost;
  const camY = sampleChannel('camY');
  const targetY = sampleChannel('targetY');
  const fov = sampleChannel('fov');

  // C2 smooth periodic micro-breath (zero value & zero slope when clamped, periodic when looping)
  const microBreath = periodic
    ? Math.sin(u * Math.PI * 2) * 0.08
    : Math.pow(Math.sin(u * Math.PI), 2) * 0.08;

  return {
    position: {
      x: Math.sin(azRad) * radius,
      y: camY + microBreath,
      z: Math.cos(azRad) * radius,
    },
    target: {
      x: 0,
      y: targetY,
      z: 0,
    },
    fov,
    shotName: localT < 0.5 ? w0.shotName : w1.shotName,
  };
}

/** Backwards-compatible alias for evaluateHermiteCameraPath */
export const evaluateCinematicCamera = evaluateHermiteCameraPath;

/**
 * Evaluates the Complete Combined Showcase ("Cinematic + 360°"):
 *   Phase 1 (u in [0.00, 0.70]): Continuous C1 Hermite-spline Cinematic Showcase
 *     (Full -> Front -> Back -> Macro Top-to-Bottom -> Full) settling smoothly to rest at u=0.70.
 *   Phase 2 (u in [0.70, 1.00]): Seamless C2 quintic-eased 360° Full Turntable Showcase
 *     with C2 sin² crane breathing (zero velocity jump at BOTH u=0.70 and u=1.00 -> 0.00!).
 */
export function evaluateCompleteShowcaseFrame(
  progress: number,
  aspect = 16 / 9
): { cameraPose: CameraKeyframePose; turntableY: number } {
  const u = progress === 1 ? 1 : wrapProgress01(progress);
  const split = 0.70;

  if (u <= split) {
    const cinematicU = u / split;
    return {
      cameraPose: evaluateHermiteCameraPath(cinematicU, aspect, false),
      turntableY: 0,
    };
  }

  // Phase 2: Slow, smooth C2 quintic-eased 360° showcase with C2 sin² breathing (zero velocity kinks!)
  const spinU = clamp01((u - split) / (1 - split));
  const easedSpin = easeInOutQuint(spinU);
  const baseFull = evaluateHermiteCameraPath(0, aspect, false);

  // sin²(π * spinU) has zero value AND zero derivative at spinU=0 and spinU=1 (zero hiccup!)
  const smoothBell = Math.pow(Math.sin(spinU * Math.PI), 2);
  const breathFactor = 1.0 - smoothBell * 0.065;

  return {
    cameraPose: {
      position: {
        x: baseFull.position.x * breathFactor,
        y: baseFull.position.y - smoothBell * 1.05,
        z: baseFull.position.z * breathFactor,
      },
      target: {
        x: 0,
        y: baseFull.target.y - smoothBell * 0.65,
        z: 0,
      },
      fov: baseFull.fov,
      shotName: '360° Showcase',
    },
    turntableY: easedSpin * Math.PI * 2,
  };
}

/**
 * Exact closed-form underdamped spring step response & velocity for stateless fractional-frame
 * temporal supersampling in `pendulum-flip` preset.
 */
function analyticalSpringStep(
  tau: number,
  omegaN = 6.8,
  zeta = 0.76
): { value: number; velocity: number } {
  if (tau <= 0) {
    return { value: 0, velocity: 0 };
  }
  const s = Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
  const omegaD = omegaN * s;
  const decay = Math.exp(-zeta * omegaN * tau);
  const cosT = Math.cos(omegaD * tau);
  const sinT = Math.sin(omegaD * tau);
  const value = 1 - decay * (cosT + (zeta / s) * sinT);
  const velocity = (omegaN / s) * decay * sinT;
  return { value, velocity };
}

export interface LiveStepOptions {
  dt: number;
  targetFlipY: number;
  autoSpin: boolean;
  previewReel?: boolean;
  previewPreset?: AnimationPreset;
  reelDurationSec?: number;
  aspect?: number;
  deterministicTime?: number;
  params?: SpringParams;
}

/**
 * Advances the live spring simulation by `dt` seconds.
 * When `previewReel` is active, drives the exact same Hermite-spline camera & physics choreography
 * used in offline rendering so the live viewport matches the final exported MP4.
 */
export function stepLiveSimulation(
  state: SpringState,
  options: LiveStepOptions
): SpringState {
  const params = options.params ?? DEFAULT_SPRING_PARAMS;
  const safeDt = Math.max(0, Math.min(options.dt, 0.05));
  const nextTime =
    options.deterministicTime !== undefined
      ? options.deterministicTime
      : state.simTime + safeDt;

  if (options.previewReel) {
    const duration = options.reelDurationSec ?? 16;
    const progress = (((nextTime % duration) + duration) % duration) / duration;
    const phase = progress * Math.PI * 2;
    const aspect = options.aspect ?? 16 / 9;

    if (options.previewPreset === 'cinematic-360') {
      const combined = evaluateCompleteShowcaseFrame(progress, aspect);
      return {
        thetaY: Math.sin(phase * 2) * 0.035,
        omegaY: 0,
        thetaX: Math.sin(phase) * 0.018,
        omegaX: 0,
        thetaZ: Math.cos(phase * 2) * 0.015,
        omegaZ: 0,
        neckSwayZ: Math.sin(phase) * 0.011,
        neckSwayX: Math.cos(phase) * 0.006,
        turntableY: combined.turntableY,
        simTime: nextTime,
        cameraPose: combined.cameraPose,
      };
    }

    const pose = evaluateHermiteCameraPath(progress, aspect, true);
    return {
      thetaY: Math.sin(phase * 2) * 0.038,
      omegaY: 0,
      thetaX: Math.sin(phase) * 0.018,
      omegaX: 0,
      thetaZ: Math.cos(phase * 2) * 0.015,
      omegaZ: 0,
      neckSwayZ: Math.sin(phase) * 0.011,
      neckSwayX: Math.cos(phase) * 0.006,
      turntableY: 0,
      simTime: nextTime,
      cameraPose: pose,
    };
  }

  // Top neck pivot: subtle low-amplitude breathing sway (+/- 0.015 rad at 0.4 Hz)
  const omegaBreath = 2 * Math.PI * 0.4;
  const neckSwayZ = Math.sin(nextTime * omegaBreath) * 0.015;
  const neckSwayX = Math.cos(nextTime * omegaBreath * 0.75) * 0.009;

  // Swivel clasp & card spring toward target flip angle
  const nextY = stepOscillator(
    state.thetaY,
    state.omegaY,
    options.targetFlipY,
    params.stiffnessY,
    params.dampingY,
    safeDt
  );

  // Subtle coupled pendulum inertia when flipping rapidly
  const flipTorqueZ = -nextY.omega * 0.012;
  const flipTorqueX = Math.abs(nextY.omega) * 0.008;

  const nextZ = stepOscillator(
    state.thetaZ,
    state.omegaZ + flipTorqueZ * safeDt * 10,
    -neckSwayZ * 0.65,
    params.stiffnessSwing,
    params.dampingSwing,
    safeDt
  );

  const nextX = stepOscillator(
    state.thetaX,
    state.omegaX + flipTorqueX * safeDt * 10,
    neckSwayX * 0.5,
    params.stiffnessSwing,
    params.dampingSwing,
    safeDt
  );

  const turntableY = options.autoSpin
    ? (state.turntableY + safeDt * ((Math.PI * 2) / 16)) % (Math.PI * 2)
    : state.turntableY;

  return {
    thetaY: nextY.theta,
    omegaY: nextY.omega,
    thetaX: nextX.theta,
    omegaX: nextX.omega,
    thetaZ: nextZ.theta,
    omegaZ: nextZ.omega,
    neckSwayZ,
    neckSwayX,
    turntableY,
    simTime: nextTime,
    cameraPose: null,
  };
}

/**
 * Computes exact, stateless deterministic rig + Hermite-spline camera pose for offline 1080p 24fps
 * cinema video rendering AND fractional sub-frame temporal supersampling (motion blur).
 * Accepts arbitrary floating-point `frameIndex` (e.g., `frame + offsetFrames`) with zero state drift.
 */
export function stepOfflinePresetFrame(
  _prevState: SpringState,
  preset: AnimationPreset,
  frameIndex: number,
  totalFrames: number,
  fps = 24,
  aspect = 16 / 9
): SpringState {
  const safeTotal = Math.max(1, totalFrames);
  const rawProgress = frameIndex / safeTotal;
  const wrappedProgress = rawProgress === 1 ? 1 : wrapProgress01(rawProgress);
  const duration = safeTotal / fps;
  const t = wrappedProgress * duration;

  const cycles = Math.max(1, Math.round(duration * 0.25));
  const phase = wrappedProgress * Math.PI * 2 * cycles;
  const neckSwayZ = Math.sin(phase) * 0.013;
  const neckSwayX = Math.cos(phase) * 0.007;

  if (preset === 'cinematic-reel') {
    const cameraPose = evaluateHermiteCameraPath(rawProgress, aspect, true);
    const loopPhase = wrappedProgress * Math.PI * 2;
    return {
      thetaY: Math.sin(loopPhase * 2) * 0.038,
      omegaY: 0,
      thetaX: Math.sin(loopPhase) * 0.018,
      omegaX: 0,
      thetaZ: Math.cos(loopPhase * 2) * 0.015,
      omegaZ: 0,
      neckSwayZ: Math.sin(loopPhase) * 0.011,
      neckSwayX: Math.cos(loopPhase) * 0.006,
      turntableY: 0,
      simTime: t,
      cameraPose,
    };
  }

  if (preset === 'cinematic-360') {
    const combined = evaluateCompleteShowcaseFrame(rawProgress, aspect);
    const loopPhase = wrappedProgress * Math.PI * 2;
    return {
      thetaY: Math.sin(loopPhase * 2) * 0.035,
      omegaY: 0,
      thetaX: Math.sin(loopPhase) * 0.018,
      omegaX: 0,
      thetaZ: Math.cos(loopPhase * 2) * 0.015,
      omegaZ: 0,
      neckSwayZ: Math.sin(loopPhase) * 0.011,
      neckSwayX: Math.cos(loopPhase) * 0.006,
      turntableY: combined.turntableY,
      simTime: t,
      cameraPose: combined.cameraPose,
    };
  }

  if (preset === 'turntable') {
    // Seamless C2 continuous 360° turntable with zero seam jump
    const eased = wrappedProgress * 0.45 + easeInOutQuint(wrappedProgress) * 0.55;
    return {
      thetaY: 0,
      omegaY: 0,
      thetaX: Math.sin(wrappedProgress * Math.PI * 2) * 0.022,
      omegaX: 0,
      thetaZ: Math.sin(wrappedProgress * Math.PI * 2) * 0.018,
      omegaZ: 0,
      neckSwayZ,
      neckSwayX,
      turntableY: eased * Math.PI * 2,
      simTime: t,
      cameraPose: null,
    };
  }

  if (preset === 'pendulum-flip') {
    // Pure closed-form analytical spring response for fractional sub-frame motion blur accuracy
    const flipOutTime = duration * 0.16;
    const flipBackTime = duration * 0.62;
    const outResp = analyticalSpringStep(t - flipOutTime);
    const backResp = analyticalSpringStep(t - flipBackTime);

    const thetaY = Math.PI * (outResp.value - backResp.value);
    const omegaY = Math.PI * (outResp.velocity - backResp.velocity);
    const gentleOrbit = Math.sin(wrappedProgress * Math.PI * 2) * 0.18;

    return {
      thetaY,
      omegaY,
      thetaX: Math.min(0.14, Math.abs(omegaY) * 0.014) + neckSwayX * 0.5,
      omegaX: 0,
      thetaZ: -omegaY * 0.018 - neckSwayZ * 0.65,
      omegaZ: 0,
      neckSwayZ,
      neckSwayX,
      turntableY: gentleOrbit,
      simTime: t,
      cameraPose: null,
    };
  }

  // 'parallax-sway'
  const swayAngle = Math.sin(wrappedProgress * Math.PI * 2) * 0.58;
  const cardLag = Math.sin(wrappedProgress * Math.PI * 2 - 0.35) * 0.06;
  const cardPitch = Math.cos(wrappedProgress * Math.PI * 2) * 0.035;
  return {
    thetaY: cardLag * 0.55,
    omegaY: 0,
    thetaX: cardPitch,
    omegaX: 0,
    thetaZ: cardLag,
    omegaZ: 0,
    neckSwayZ: Math.sin(wrappedProgress * Math.PI * 2) * 0.02,
    neckSwayX: Math.cos(wrappedProgress * Math.PI * 2) * 0.01,
    turntableY: swayAngle,
    simTime: t,
    cameraPose: null,
  };
}
