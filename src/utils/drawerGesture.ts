/**
 * Pure swipe-down mobile bottom sheet gesture physics helper.
 * Decoupled from DOM/React so dismiss thresholds, flick velocity, and upward
 * resistance can be unit-tested deterministically.
 */

export interface DrawerSwipeConfig {
  /** Minimum downward pull distance (px) to dismiss even at low velocity */
  dismissDistancePx: number;
  /** Minimum downward flick velocity (px/ms) to dismiss when dragged at least minFlickDistancePx */
  dismissVelocityPxPerMs: number;
  /** Minimum downward distance (px) required alongside a fast flick to prevent accidental micro-taps */
  minFlickDistancePx: number;
  /** Maximum upward rubber-band stretch (px) when pulling above resting position */
  maxUpwardStretchPx: number;
}

export const DEFAULT_DRAWER_SWIPE_CONFIG: DrawerSwipeConfig = {
  dismissDistancePx: 88,
  dismissVelocityPxPerMs: 0.45,
  minFlickDistancePx: 28,
  maxUpwardStretchPx: 14,
};

/**
 * Maps raw pointer deltaY (positive = downward) to visual sheet translateY offset.
 * Downward drag tracks 1:1 with finger; upward drag applies smooth rubber-band damping.
 */
export function computeDrawerDragOffset(
  deltaY: number,
  config: DrawerSwipeConfig = DEFAULT_DRAWER_SWIPE_CONFIG
): number {
  if (deltaY >= 0) {
    return deltaY;
  }
  // Gentle rubber-band resistance if user pulls slightly upward
  const damped = deltaY * 0.18;
  return Math.max(-config.maxUpwardStretchPx, damped);
}

/**
 * Decides whether releasing a mobile drawer drag should dismiss the drawer or snap back open.
 */
export function shouldDismissDrawerOnRelease(
  offsetPx: number,
  velocityPxPerMs: number,
  config: DrawerSwipeConfig = DEFAULT_DRAWER_SWIPE_CONFIG
): boolean {
  if (offsetPx >= config.dismissDistancePx) {
    return true;
  }
  if (
    offsetPx >= config.minFlickDistancePx &&
    velocityPxPerMs >= config.dismissVelocityPxPerMs
  ) {
    return true;
  }
  return false;
}

/**
 * Computes backdrop opacity multiplier in [0, 1] as the sheet is dragged downward.
 */
export function computeBackdropOpacity(offsetPx: number, sheetHeightPx = 560): number {
  if (offsetPx <= 0) return 1;
  const safeHeight = Math.max(180, sheetHeightPx);
  const progress = Math.min(1, offsetPx / safeHeight);
  return Math.max(0.08, 1 - progress * 0.85);
}
