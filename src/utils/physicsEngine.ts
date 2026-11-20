/**
 * Pure, deterministic physics & animation curve module for the ID card + lanyard rig.
 * Decoupled from Three.js/React so it can be stepped identically during live preview
 * and offline 60fps frame-by-frame rendering, and unit-tested directly.
 */

export type AnimationPreset = 'turntable' | 'pendulum-flip' | 'parallax-sway';

export interface SpringState {
  /** Card Y-axis flip / spin angle (radians) */
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
}

export interface SpringParams {
  stiffnessY: number;
  dampingY: number;
  stiffnessSwing: number;
  dampingSwing: number;
}

export const DEFAULT_SPRING_PARAMS: SpringParams = {
  // Critically damped-ish (c = 2 * sqrt(k) -> slightly underdamped for lively natural feel)
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
  };
}

/**
 * Critically damped harmonic oscillator integration step:
 *   alpha = -k * (theta - thetaTarget) - c * omega
 * Uses semi-implicit Euler with sub-stepping for unconditional stability.
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

export function easeInOutSine(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * clamped) - 1) / 2;
}

export function easeInOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export interface LiveStepOptions {
  dt: number;
  targetFlipY: number;
  autoSpin: boolean;
  deterministicTime?: number;
  params?: SpringParams;
}

/**
 * Advances the spring simulation by `dt` seconds.
 * When `deterministicTime` is provided, breathing sway uses that exact timestamp.
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

  // Top neck pivot: subtle low-amplitude breathing sway (+/- 0.015 rad at 0.4 Hz)
  const omegaBreath = 2 * Math.PI * 0.4;
  const neckSwayZ = Math.sin(nextTime * omegaBreath) * 0.015;
  const neckSwayX = Math.cos(nextTime * omegaBreath * 0.75) * 0.009;

  // Clasp hinge spring toward target flip angle
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

  // Turntable preview rotation (~36 deg/sec)
  const turntableY = options.autoSpin
    ? (state.turntableY + safeDt * ((Math.PI * 2) / 10)) % (Math.PI * 2)
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
  };
}

/**
 * Computes exact deterministic pose for offline 1080p 60fps video rendering.
 * Runs the spring integrator cleanly for the `pendulum-flip` preset and analytic
 * seamless curves for `turntable` and `parallax-sway`.
 */
export function stepOfflinePresetFrame(
  prevState: SpringState,
  preset: AnimationPreset,
  frameIndex: number,
  totalFrames: number,
  fps = 60
): SpringState {
  const dt = 1 / fps;
  const t = frameIndex / fps;
  const progress = totalFrames > 0 ? frameIndex / totalFrames : 0;

  // Seamless periodic breathing sway locked to total duration
  const duration = totalFrames / fps;
  const cycles = Math.max(1, Math.round(duration * 0.4));
  const phase = progress * Math.PI * 2 * cycles;
  const neckSwayZ = Math.sin(phase) * 0.015;
  const neckSwayX = Math.cos(phase) * 0.008;

  if (preset === 'turntable') {
    // Seamless 360° turntable with subtle easing speed modulation
    const eased = progress * 0.85 + easeInOutSine(progress) * 0.15;
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
    };
  }

  if (preset === 'pendulum-flip') {
    // Spring-driven 180° flip at 18% and return at 62% with realistic pendulum coupling
    const targetY = progress >= 0.14 && progress < 0.60 ? Math.PI : 0;
    const baseState = frameIndex === 0 ? createInitialSpringState() : prevState;
    const stepped = stepLiveSimulation(baseState, {
      dt,
      targetFlipY: targetY,
      autoSpin: false,
      deterministicTime: t,
    });
    // Add subtle studio turntable drift (+/- 10 deg) so light catches the hologram & bevels
    const gentleOrbit = Math.sin(progress * Math.PI * 2) * 0.18;
    return {
      ...stepped,
      neckSwayZ,
      neckSwayX,
      turntableY: gentleOrbit,
    };
  }

  // 'parallax-sway': Hero studio showcase oscillating +/- 38° with gentle pendulum tilt
  const swayAngle = Math.sin(progress * Math.PI * 2) * 0.66;
  const cardLag = Math.sin(progress * Math.PI * 2 - 0.35) * 0.075;
  const cardPitch = Math.cos(progress * Math.PI * 2) * 0.045;
  return {
    thetaY: cardLag * 0.6,
    omegaY: 0,
    thetaX: cardPitch,
    omegaX: 0,
    thetaZ: cardLag,
    omegaZ: 0,
    neckSwayZ: Math.sin(progress * Math.PI * 2) * 0.025,
    neckSwayX: Math.cos(progress * Math.PI * 2) * 0.012,
    turntableY: swayAngle,
    simTime: t,
  };
}
