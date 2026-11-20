import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DRAWER_SWIPE_CONFIG,
  computeBackdropOpacity,
  computeDrawerDragOffset,
  shouldDismissDrawerOnRelease,
} from './drawerGesture';

test('computeDrawerDragOffset tracks downward drag 1:1 and rubber-bands upward pull', () => {
  assert.equal(computeDrawerDragOffset(0), 0);
  assert.equal(computeDrawerDragOffset(120), 120);
  const upSmall = computeDrawerDragOffset(-30);
  assert.ok(upSmall < 0 && upSmall > -30);
  const upHuge = computeDrawerDragOffset(-500);
  assert.equal(upHuge, -DEFAULT_DRAWER_SWIPE_CONFIG.maxUpwardStretchPx);
});

test('shouldDismissDrawerOnRelease dismisses on sufficient distance or downward flick, snaps back on tiny tap', () => {
  // Sufficient slow drag
  assert.equal(shouldDismissDrawerOnRelease(95, 0.05), true);
  // Fast downward flick above minFlickDistancePx
  assert.equal(shouldDismissDrawerOnRelease(36, 0.65), true);
  // Tiny micro-tap even with high instantaneous velocity should NOT dismiss accidentally
  assert.equal(shouldDismissDrawerOnRelease(12, 0.9), false);
  // Short slow drag snaps back open
  assert.equal(shouldDismissDrawerOnRelease(45, 0.1), false);
  // Upward pull snaps back open
  assert.equal(shouldDismissDrawerOnRelease(-10, -0.5), false);
});

test('computeBackdropOpacity smoothly fades backdrop during downward drag', () => {
  assert.equal(computeBackdropOpacity(0, 560), 1);
  assert.equal(computeBackdropOpacity(-10, 560), 1);
  const mid = computeBackdropOpacity(280, 560);
  assert.ok(mid > 0.4 && mid < 0.7);
  const full = computeBackdropOpacity(700, 560);
  assert.ok(full >= 0.08 && full <= 0.2);
});
