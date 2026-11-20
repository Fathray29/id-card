import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSpringState,
  cubicHermite,
  easeInOutQuint,
  evaluateCompleteShowcaseFrame,
  evaluateHermiteCameraPath,
  stepLiveSimulation,
  stepOfflinePresetFrame,
  stepOscillator,
} from './physicsEngine';
import {
  createInitialFpsMonitorState,
  updateFpsMonitor,
} from './performanceMonitor';

test('critically damped oscillator converges cleanly to target flip angle', () => {
  let theta = 0;
  let omega = 0;
  const target = Math.PI;
  const dt = 1 / 60;

  for (let i = 0; i < 180; i++) {
    const next = stepOscillator(theta, omega, target, 42.0, 11.2, dt);
    theta = next.theta;
    omega = next.omega;
  }

  assert.ok(Math.abs(theta - Math.PI) < 0.01, `Expected convergence to PI, got ${theta}`);
  assert.ok(Math.abs(omega) < 0.05, `Expected velocity near 0, got ${omega}`);
});

test('cubicHermite and easeInOutQuint satisfy C2 boundary smoothness without mid-segment whip', () => {
  assert.equal(cubicHermite(10, 0, 20, 0, 0), 10);
  assert.equal(cubicHermite(10, 0, 20, 0, 1), 20);
  assert.equal(cubicHermite(10, 0, 20, 0, 0.5), 15);

  // C2 Quintic smootherstep starts & ends with near-zero slope AND caps mid-segment slope below 1.9x (zero whip)
  assert.equal(easeInOutQuint(0), 0);
  assert.equal(easeInOutQuint(1), 1);
  assert.ok(easeInOutQuint(0.05) < 0.002, 'Quintic ease-in should accelerate ultra-gently');
  assert.ok(1 - easeInOutQuint(0.95) < 0.002, 'Quintic ease-out should decelerate ultra-gently');
  const midSlope = (easeInOutQuint(0.51) - easeInOutQuint(0.49)) / 0.02;
  assert.ok(midSlope < 1.95, `Expected gentle peak slope < 1.95x (no whip-pan), got ${midSlope}`);
});

test('offline simulation stepping is 100% deterministic across independent runs (cinematic & cinematic-360)', () => {
  for (const preset of ['cinematic-reel', 'cinematic-360'] as const) {
    let runA = createInitialSpringState();
    let runB = createInitialSpringState();

    const totalFrames = 960;
    for (let f = 0; f < totalFrames; f++) {
      runA = stepOfflinePresetFrame(runA, preset, f, totalFrames, 60, 16 / 9);
      runB = stepOfflinePresetFrame(runB, preset, f, totalFrames, 60, 16 / 9);

      assert.equal(runA.thetaY, runB.thetaY);
      assert.equal(runA.turntableY, runB.turntableY);
      assert.equal(runA.cameraPose?.position.x, runB.cameraPose?.position.x);
      assert.equal(runA.cameraPose?.position.y, runB.cameraPose?.position.y);
      assert.equal(runA.cameraPose?.position.z, runB.cameraPose?.position.z);
      assert.equal(runA.cameraPose?.target.y, runB.cameraPose?.target.y);
    }
  }
});

test('Hermite-spline cinematic showcase cycles Full -> Front -> Back -> Macro (Top to Bottom) -> Full seamlessly', () => {
  const fullStart = evaluateHermiteCameraPath(0.0, 16 / 9);
  const frontMid = evaluateHermiteCameraPath(0.34, 16 / 9);
  const backMid = evaluateHermiteCameraPath(0.60, 16 / 9);
  const macroTop = evaluateHermiteCameraPath(0.80, 16 / 9);
  const macroBottom = evaluateHermiteCameraPath(0.90, 16 / 9);
  const fullEnd = evaluateHermiteCameraPath(1.0, 16 / 9);

  // Act 1: Full establishing shot with generous lanyard clearance
  assert.ok(fullStart.position.z > 78, `Expected Full Z > 78, got ${fullStart.position.z}`);
  assert.ok(fullStart.target.y > 16, `Expected Full target Y > 16, got ${fullStart.target.y}`);

  // Act 2: Front hero shot (+Z side)
  assert.ok(frontMid.position.z > 14 && frontMid.position.z < 24);
  assert.ok(Math.abs(frontMid.target.y) < 2.5);

  // Act 3: Back hero shot (-Z side) with safe non-clipping Hermite orbit clearance
  assert.ok(backMid.position.z < -14, `Expected Back Z < -14, got ${backMid.position.z}`);
  for (let u = 0.39; u <= 0.66; u += 0.01) {
    const p = evaluateHermiteCameraPath(u, 16 / 9);
    const radialDist = Math.hypot(p.position.x, p.position.z);
    assert.ok(radialDist > 15, `Orbit radius clipped too close (${radialDist}) at u=${u}`);
  }

  // Act 4: Macro close-up sweeping smoothly Top -> Bottom
  const macroTopRadius = Math.hypot(macroTop.position.x, macroTop.position.z);
  const macroBotRadius = Math.hypot(macroBottom.position.x, macroBottom.position.z);
  assert.ok(macroTopRadius < 11.5, `Expected close Macro Top radius < 11.5, got ${macroTopRadius}`);
  assert.ok(macroBotRadius < 11.5, `Expected close Macro Bottom radius < 11.5, got ${macroBotRadius}`);
  assert.ok(macroTop.target.y > 5.5, `Expected Macro Top target Y > 5.5, got ${macroTop.target.y}`);
  assert.ok(
    macroBottom.target.y < -1.8,
    `Expected Macro Bottom target Y < -1.8, got ${macroBottom.target.y}`
  );

  // Act 5: Seamless return to starting Full pose
  const loopGap = Math.hypot(
    fullEnd.position.x - fullStart.position.x,
    fullEnd.position.y - fullStart.position.y,
    fullEnd.position.z - fullStart.position.z
  );
  assert.ok(loopGap < 0.05, `Expected seamless loop closure (< 0.05), got ${loopGap}`);

  // Portrait 9:16 mobile compensation pulls radius further back
  const portraitFront = evaluateHermiteCameraPath(0.34, 9 / 16);
  const desktopRadius = Math.hypot(frontMid.position.x, frontMid.position.z);
  const portraitRadius = Math.hypot(portraitFront.position.x, portraitFront.position.z);
  assert.ok(portraitRadius > desktopRadius * 1.15);
});

test('Complete Showcase (Cinematic + 360°) plays Cinematic first then seamless 360° orbit', () => {
  const start = evaluateCompleteShowcaseFrame(0.0, 16 / 9);
  const frontPhase = evaluateCompleteShowcaseFrame(0.24, 16 / 9);
  const macroPhase = evaluateCompleteShowcaseFrame(0.60, 16 / 9);
  const spinMid = evaluateCompleteShowcaseFrame(0.85, 16 / 9);
  const end = evaluateCompleteShowcaseFrame(1.0, 16 / 9);

  // Phase 1 (Cinematic): turntable stays at 0 while camera sweeps Front/Back/Macro
  assert.equal(frontPhase.turntableY, 0);
  assert.equal(macroPhase.turntableY, 0);
  assert.ok(Math.hypot(macroPhase.cameraPose.position.x, macroPhase.cameraPose.position.z) < 12);

  // Phase 2 (360°): camera returns to Full distance while turntable completes 2*PI revolution
  assert.equal(spinMid.cameraPose.shotName, '360° Showcase');
  assert.ok(Math.abs(spinMid.turntableY - Math.PI) < 0.05);
  assert.ok(Math.abs(end.turntableY - Math.PI * 2) < 1e-6);

  // Seamless position closure from t=0 to t=1
  const gap = Math.hypot(
    end.cameraPose.position.x - start.cameraPose.position.x,
    end.cameraPose.position.y - start.cameraPose.position.y,
    end.cameraPose.position.z - start.cameraPose.position.z
  );
  assert.ok(gap < 0.05, `Expected seamless loop closure (< 0.05), got ${gap}`);
});

test('mobile performance monitor degrades MSAA & shadows below 45fps and pauses during offline render', () => {
  // Start on mobile device
  let monitor = createInitialFpsMonitorState(true);
  assert.equal(monitor.tier.highFidelityShadows, true);
  assert.equal(monitor.tier.msaaSamples, 2);

  // During offline rendering, low deltas must NEVER degrade or mutate monitor
  for (let i = 0; i < 40; i++) {
    const res = updateFpsMonitor(monitor, 1 / 20, { isOfflineRendering: true, isSoftwareGl: false });
    monitor = res.nextState;
    assert.equal(res.tierChanged, false);
  }
  assert.equal(monitor.tier.highFidelityShadows, true);

  // Simulate mobile frame drop to ~28 fps for > 1 second during live preview
  let degraded = false;
  for (let i = 0; i < 35; i++) {
    const res = updateFpsMonitor(monitor, 1 / 28, { isOfflineRendering: false, isSoftwareGl: false });
    monitor = res.nextState;
    if (res.tierChanged) degraded = true;
  }
  assert.equal(degraded, true);
  assert.equal(monitor.tier.lowFpsDegraded, true);
  assert.equal(monitor.tier.highFidelityShadows, false);
  assert.equal(monitor.tier.msaaSamples, 0);
  assert.equal(monitor.tier.maxDpr, 1.0);
});

test('turntable preset completes seamless 360-degree loop', () => {
  const start = stepOfflinePresetFrame(createInitialSpringState(), 'turntable', 0, 240, 60);
  const end = stepOfflinePresetFrame(start, 'turntable', 240, 240, 60);

  assert.equal(start.turntableY, 0);
  assert.ok(Math.abs(end.turntableY - Math.PI * 2) < 1e-6);
});

test('live simulation breathing sway stays within +/- 0.015 rad amplitude', () => {
  let state = createInitialSpringState();
  for (let f = 0; f < 300; f++) {
    state = stepLiveSimulation(state, {
      dt: 1 / 60,
      targetFlipY: 0,
      autoSpin: false,
      deterministicTime: f / 60,
    });
    assert.ok(Math.abs(state.neckSwayZ) <= 0.015001);
  }
});
