/**
 * Pure, testable mobile device detector and adaptive performance monitor logic.
 * Detects mobile/touch devices and monitors live viewport FPS to automatically
 * reduce MSAA samples and disable high-fidelity shadows if frame rate drops below 45fps,
 * while never altering deterministic offline render timing.
 */

export interface PerformanceTier {
  isMobileDevice: boolean;
  lowFpsDegraded: boolean;
  msaaSamples: number;
  highFidelityShadows: boolean;
  maxDpr: number;
}

export interface FpsMonitorState {
  frameCount: number;
  elapsedSec: number;
  consecutiveLowWindows: number;
  consecutiveHighWindows: number;
  tier: PerformanceTier;
}

export const MOBILE_FPS_DOWNGRADE_THRESHOLD = 45;
export const MOBILE_FPS_RECOVERY_THRESHOLD = 54;
export const FPS_SAMPLE_WINDOW_SEC = 1.0;

/**
 * Detects mobile / tablet touch devices using viewport width, pointer coarseness, and UA heuristics.
 */
export function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const narrowViewport = window.innerWidth < 1024;
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const mobileUa =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return narrowViewport || coarsePointer || mobileUa;
}

export function createInitialPerformanceTier(isMobileDevice: boolean): PerformanceTier {
  return {
    isMobileDevice,
    lowFpsDegraded: false,
    msaaSamples: isMobileDevice ? 2 : 4,
    highFidelityShadows: true,
    maxDpr: isMobileDevice ? 1.5 : 2.0,
  };
}

export function createInitialFpsMonitorState(isMobileDevice: boolean): FpsMonitorState {
  return {
    frameCount: 0,
    elapsedSec: 0,
    consecutiveLowWindows: 0,
    consecutiveHighWindows: 0,
    tier: createInitialPerformanceTier(isMobileDevice),
  };
}

/**
 * Advances the rolling FPS monitor by one frame delta.
 * - Paused automatically during offline renders or software-GL demand rendering.
 * - On mobile devices, if FPS drops below 45fps over a sampling window, automatically
 *   reduces MSAA samples (down to 1/0) and disables high-fidelity shadows.
 * - Uses hysteresis (sustained >= 54fps for 3 windows) to avoid visual flickering.
 */
export function updateFpsMonitor(
  state: FpsMonitorState,
  deltaSec: number,
  options: { isOfflineRendering: boolean; isSoftwareGl: boolean }
): { nextState: FpsMonitorState; tierChanged: boolean; measuredFps: number | null } {
  if (options.isOfflineRendering || options.isSoftwareGl) {
    return { nextState: state, tierChanged: false, measuredFps: null };
  }

  // Clamp outlier spikes (e.g. tab backgrounding) so a single tab switch doesn't falsely trigger
  const safeDelta = Math.max(0.001, Math.min(deltaSec, 0.25));
  const frameCount = state.frameCount + 1;
  const elapsedSec = state.elapsedSec + safeDelta;

  if (elapsedSec < FPS_SAMPLE_WINDOW_SEC) {
    return {
      nextState: { ...state, frameCount, elapsedSec },
      tierChanged: false,
      measuredFps: null,
    };
  }

  const fps = frameCount / elapsedSec;
  let consecutiveLowWindows = state.consecutiveLowWindows;
  let consecutiveHighWindows = state.consecutiveHighWindows;
  let tier = state.tier;
  let tierChanged = false;

  if (tier.isMobileDevice) {
    if (fps < MOBILE_FPS_DOWNGRADE_THRESHOLD) {
      consecutiveLowWindows += 1;
      consecutiveHighWindows = 0;

      if (!tier.lowFpsDegraded) {
        tier = {
          ...tier,
          lowFpsDegraded: true,
          msaaSamples: fps < 30 ? 0 : 2,
          highFidelityShadows: false,
          maxDpr: 1.0,
        };
        tierChanged = true;
      } else if (fps < 30 && tier.msaaSamples !== 0) {
        tier = { ...tier, msaaSamples: 0 };
        tierChanged = true;
      }
    } else if (fps >= MOBILE_FPS_RECOVERY_THRESHOLD) {
      consecutiveHighWindows += 1;
      consecutiveLowWindows = 0;

      if (tier.lowFpsDegraded && consecutiveHighWindows >= 3) {
        tier = createInitialPerformanceTier(true);
        tierChanged = true;
      }
    } else {
      consecutiveLowWindows = 0;
      consecutiveHighWindows = 0;
    }
  }

  return {
    nextState: {
      frameCount: 0,
      elapsedSec: 0,
      consecutiveLowWindows,
      consecutiveHighWindows,
      tier,
    },
    tierChanged,
    measuredFps: fps,
  };
}
