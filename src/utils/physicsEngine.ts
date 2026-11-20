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

export type VideoDurationSec = 8 | 10 | 14 | 18;

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
 * Non-linear quintic ease-in-out curve (C2 smooth: zero velocity & zero acceleration at endpoints).
 */
export function easeInOutQuint(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 16 * c * c * c * c * c : 1 - Math.pow(-2 * c + 2, 5) / 2;
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

/** Orbital camera waypoint along the Hermite spline path */
interface OrbitalWaypoint {
  t: number;
  azimuthDeg: number; // 0 = +Z front, 90 = +X right, 180 = -Z back, -360 = +Z front
  radius: number; // Horizontal XZ distance from target (cm)
  camY: number; // Camera height (cm)
  targetY: number; // Look-at height (cm)
  fov: number;
  /** Tangent tension multiplier (0 = smooth settle/hold, 0.45 = flowing graceful curve) */
  tension: number;
  shotName: CameraKeyframePose['shotName'];
}

/**
 * Slow, Graceful 5-Act Hermite-Spline Cinematic Commercial Path:
 *   Full Establishing -> Front Hero -> Back Hero (silky 180° non-clipping orbit) ->
 *   Macro Top (Lanyard Weave + Crimp + Seated Clasp) ->
 *   Macro Bottom (Slow Crane Glide down Card Face) -> Graceful Pull-Back to Full
 */
const CINEMATIC_REEL_WAYPOINTS: OrbitalWaypoint[] = [
  // Act 1: Full Lanyard & Card Establishing Hero (entire 80cm loop + card cleanly framed with air)
  { t: 0.0, azimuthDeg: 10, radius: 86.0, camY: 18.2, targetY: 17.2, fov: 36, tension: 0.25, shotName: 'Full' },
  { t: 0.14, azimuthDeg: -5, radius: 79.0, camY: 16.9, targetY: 16.0, fov: 35.2, tension: 0.45, shotName: 'Full' },

  // Act 2: Graceful Hermite Dolly-In to Card Front Hero + slow specular sweep
  { t: 0.28, azimuthDeg: 13, radius: 19.8, camY: 1.4, targetY: 0.35, fov: 34, tension: 0.35, shotName: 'Front' },
  { t: 0.41, azimuthDeg: -13, radius: 18.8, camY: 0.85, targetY: 0.1, fov: 33.5, tension: 0.4, shotName: 'Front' },

  // Act 3: Silky 180° Orbital Arc around side bevel to Card Back Face
  { t: 0.54, azimuthDeg: -166, radius: 19.6, camY: 1.15, targetY: 0.25, fov: 34, tension: 0.4, shotName: 'Back' },
  { t: 0.65, azimuthDeg: -194, radius: 18.8, camY: 0.75, targetY: 0.1, fov: 33.5, tension: 0.35, shotName: 'Back' },

  // Act 4: Slow Macro Crane Sweep (Top: Weave/Crimp/Seated Clasp -> Bottom: Card Detail)
  { t: 0.75, azimuthDeg: -342, radius: 9.0, camY: 7.2, targetY: 6.2, fov: 32, tension: 0.25, shotName: 'Macro Top' },
  { t: 0.90, azimuthDeg: -372, radius: 9.6, camY: -1.8, targetY: -2.2, fov: 32, tension: 0.25, shotName: 'Macro Bottom' },

  // Act 5: Graceful Pull-Back Return to Exact Starting Full Pose (azimuth -350° === +10° mod 360°)
  { t: 1.0, azimuthDeg: -350, radius: 86.0, camY: 18.2, targetY: 17.2, fov: 36, tension: 0.25, shotName: 'Full' },
];

type NumericChannel = 'azimuthDeg' | 'radius' | 'camY' | 'targetY' | 'fov';

/**
 * Computes damped, overshoot-safe Catmull-Rom Hermite tangents for a waypoint channel.
 * Guarantees monotonicity around extrema so radius never dips/clips during curved orbits.
 */
function computeHermiteTangent(
  waypoints: OrbitalWaypoint[],
  index: number,
  channel: NumericChannel
): number {
  const n = waypoints.length;
  const curr = waypoints[index];
  if (index === 0 || index === n - 1) {
    return 0;
  }

  const prev = waypoints[index - 1];
  const next = waypoints[index + 1];
  const dPrev = curr[channel] - prev[channel];
  const dNext = next[channel] - curr[channel];

  // Clamp tangent to 0 at local extrema (monotone cubic Hermite condition) to prevent overshoot/clipping
  if (dPrev * dNext <= 0) {
    return 0;
  }

  const rawTangent = 0.5 * (dPrev + dNext);
  return rawTangent * curr.tension;
}

/**
 * Evaluates a smooth, C2-graceful Cubic Hermite Spline camera pose with non-linear
 * quintic ease-in-out timing at normalized progress `u in [0, 1]`.
 * Automatically scales radius for portrait (9:16) and square (1:1) framing.
 */
export function evaluateHermiteCameraPath(
  progress: number,
  aspect = 16 / 9
): CameraKeyframePose {
  const u = clamp01(progress);

  let idx = 0;
  for (let i = 0; i < CINEMATIC_REEL_WAYPOINTS.length - 1; i++) {
    if (u >= CINEMATIC_REEL_WAYPOINTS[i].t && u <= CINEMATIC_REEL_WAYPOINTS[i + 1].t) {
      idx = i;
      break;
    }
  }

  const w0 = CINEMATIC_REEL_WAYPOINTS[idx];
  const w1 = CINEMATIC_REEL_WAYPOINTS[idx + 1];
  const span = Math.max(1e-6, w1.t - w0.t);
  const localT = clamp01((u - w0.t) / span);

  // Pure non-linear quintic ease-in-out eliminates harsh transitions at every hero view
  const eased = easeInOutQuint(localT);

  const sampleChannel = (ch: NumericChannel): number => {
    const m0 = computeHermiteTangent(CINEMATIC_REEL_WAYPOINTS, idx, ch);
    const m1 = computeHermiteTangent(CINEMATIC_REEL_WAYPOINTS, idx + 1, ch);
    return cubicHermite(w0[ch], m0, w1[ch], m1, eased);
  };

  const azDeg = sampleChannel('azimuthDeg');
  const azRad = (azDeg * Math.PI) / 180;

  // Portrait / mobile framing compensation
  const portraitBoost = aspect < 0.85 ? 1.24 : aspect < 1.15 ? 1.08 : 1.0;
  const radius = sampleChannel('radius') * portraitBoost;
  const camY = sampleChannel('camY');
  const targetY = sampleChannel('targetY');
  const fov = sampleChannel('fov');

  // Subtle slow crane float (zero at u=0 and u=1 for seamless looping)
  const microBreath = Math.sin(u * Math.PI * 2) * 0.1;

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
 *   Phase 1 (u in [0.00, 0.65]): Full slow Hermite-spline Cinematic Showcase
 *     (Full -> Front -> Back -> Macro Top-to-Bottom -> Full)
 *   Phase 2 (u in [0.65, 1.00]): Seamless quintic-eased 360° Full Turntable Showcase
 *     returning cleanly to exact starting pose (t=1.0 === t=0.0).
 */
export function evaluateCompleteShowcaseFrame(
  progress: number,
  aspect = 16 / 9
): { cameraPose: CameraKeyframePose; turntableY: number } {
  const u = clamp01(progress);
  const split = 0.65;

  if (u <= split) {
    const cinematicU = u / split;
    return {
      cameraPose: evaluateHermiteCameraPath(cinematicU, aspect),
      turntableY: 0,
    };
  }

  // Phase 2: Smooth quintic-eased 360° showcase at graceful Full establishing distance
  const spinU = (u - split) / (1 - split);
  const easedSpin = easeInOutQuint(spinU);
  const baseFull = evaluateHermiteCameraPath(0, aspect);

  // Subtle graceful dolly breath during the 360° spin (peaks gently mid-spin, returns identically at 0 and 1)
  const breathFactor = 1.0 - Math.sin(spinU * Math.PI) * 0.08;

  return {
    cameraPose: {
      position: {
        x: baseFull.position.x * breathFactor,
        y: baseFull.position.y - Math.sin(spinU * Math.PI) * 1.2,
        z: baseFull.position.z * breathFactor,
      },
      target: {
        x: 0,
        y: baseFull.target.y - Math.sin(spinU * Math.PI) * 0.8,
        z: 0,
      },
      fov: baseFull.fov,
      shotName: '360° Showcase',
    },
    turntableY: easedSpin * Math.PI * 2,
  };
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
    const duration = options.reelDurationSec ?? 10;
    const progress = (((nextTime % duration) + duration) % duration) / duration;
    const phase = progress * Math.PI * 2;
    const aspect = options.aspect ?? 16 / 9;

    if (options.previewPreset === 'cinematic-360') {
      const combined = evaluateCompleteShowcaseFrame(progress, aspect);
      return {
        thetaY: Math.sin(phase * 2) * 0.04,
        omegaY: 0,
        thetaX: Math.sin(phase) * 0.02,
        omegaX: 0,
        thetaZ: Math.cos(phase * 2) * 0.018,
        omegaZ: 0,
        neckSwayZ: Math.sin(phase) * 0.012,
        neckSwayX: Math.cos(phase) * 0.007,
        turntableY: combined.turntableY,
        simTime: nextTime,
        cameraPose: combined.cameraPose,
      };
    }

    const pose = evaluateHermiteCameraPath(progress, aspect);
    return {
      thetaY: Math.sin(phase * 2) * 0.045,
      omegaY: 0,
      thetaX: Math.sin(phase) * 0.02,
      omegaX: 0,
      thetaZ: Math.cos(phase * 2) * 0.018,
      omegaZ: 0,
      neckSwayZ: Math.sin(phase) * 0.012,
      neckSwayX: Math.cos(phase) * 0.007,
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
    ? (state.turntableY + safeDt * ((Math.PI * 2) / 14)) % (Math.PI * 2)
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
 * Computes exact deterministic rig + Hermite-spline camera pose for offline 1080p 60fps video rendering.
 * Timing is strictly `frameIndex / fps` so frame cadence never varies across mobile/desktop devices.
 */
export function stepOfflinePresetFrame(
  prevState: SpringState,
  preset: AnimationPreset,
  frameIndex: number,
  totalFrames: number,
  fps = 60,
  aspect = 16 / 9
): SpringState {
  const dt = 1 / fps;
  const t = frameIndex / fps;
  const progress = totalFrames > 0 ? frameIndex / totalFrames : 0;

  const duration = totalFrames / fps;
  const cycles = Math.max(1, Math.round(duration * 0.3));
  const phase = progress * Math.PI * 2 * cycles;
  const neckSwayZ = Math.sin(phase) * 0.014;
  const neckSwayX = Math.cos(phase) * 0.008;

  if (preset === 'cinematic-reel') {
    const cameraPose = evaluateHermiteCameraPath(progress, aspect);
    const loopPhase = progress * Math.PI * 2;
    return {
      thetaY: Math.sin(loopPhase * 2) * 0.045,
      omegaY: 0,
      thetaX: Math.sin(loopPhase) * 0.02,
      omegaX: 0,
      thetaZ: Math.cos(loopPhase * 2) * 0.018,
      omegaZ: 0,
      neckSwayZ: Math.sin(loopPhase) * 0.012,
      neckSwayX: Math.cos(loopPhase) * 0.007,
      turntableY: 0,
      simTime: t,
      cameraPose,
    };
  }

  if (preset === 'cinematic-360') {
    const combined = evaluateCompleteShowcaseFrame(progress, aspect);
    const loopPhase = progress * Math.PI * 2;
    return {
      thetaY: Math.sin(loopPhase * 2) * 0.04,
      omegaY: 0,
      thetaX: Math.sin(loopPhase) * 0.02,
      omegaX: 0,
      thetaZ: Math.cos(loopPhase * 2) * 0.018,
      omegaZ: 0,
      neckSwayZ: Math.sin(loopPhase) * 0.012,
      neckSwayX: Math.cos(loopPhase) * 0.007,
      turntableY: combined.turntableY,
      simTime: t,
      cameraPose: combined.cameraPose,
    };
  }

  if (preset === 'turntable') {
    const eased = progress * 0.55 + easeInOutQuint(progress) * 0.45;
    return {
      thetaY: 0,
      omegaY: 0,
      thetaX: Math.sin(progress * Math.PI * 2) * 0.025,
      omegaX: 0,
      thetaZ: Math.sin(progress * Math.PI * 2) * 0.02,
      omegaZ: 0,
      neckSwayZ,
      neckSwayX,
      turntableY: eased * Math.PI * 2,
      simTime: t,
      cameraPose: null,
    };
  }

  if (preset === 'pendulum-flip') {
    const targetY = progress >= 0.14 && progress < 0.6 ? Math.PI : 0;
    const baseState = frameIndex === 0 ? createInitialSpringState() : prevState;
    const stepped = stepLiveSimulation(baseState, {
      dt,
      targetFlipY: targetY,
      autoSpin: false,
      deterministicTime: t,
    });
    const gentleOrbit = Math.sin(progress * Math.PI * 2) * 0.2;
    return {
      ...stepped,
      neckSwayZ,
      neckSwayX,
      turntableY: gentleOrbit,
      cameraPose: null,
    };
  }

  // 'parallax-sway'
  const swayAngle = Math.sin(progress * Math.PI * 2) * 0.62;
  const cardLag = Math.sin(progress * Math.PI * 2 - 0.35) * 0.065;
  const cardPitch = Math.cos(progress * Math.PI * 2) * 0.04;
  return {
    thetaY: cardLag * 0.55,
    omegaY: 0,
    thetaX: cardPitch,
    omegaX: 0,
    thetaZ: cardLag,
    omegaZ: 0,
    neckSwayZ: Math.sin(progress * Math.PI * 2) * 0.022,
    neckSwayX: Math.cos(progress * Math.PI * 2) * 0.011,
    turntableY: swayAngle,
    simTime: t,
    cameraPose: null,
  };
}
