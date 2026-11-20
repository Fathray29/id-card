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
import {
  STILL_12MP_RESOLUTIONS,
  STILL_RGSS_OFFSETS,
  buildTemporalShutterSamples,
  computeRenderTiles,
} from './renderMath';

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
  const backMid = evaluateHermiteCameraPath(0.58, 16 / 9);
  const macroTop = evaluateHermiteCameraPath(0.76, 16 / 9);
  const macroBottom = evaluateHermiteCameraPath(0.86, 16 / 9);
  const fullEnd = evaluateHermiteCameraPath(1.0, 16 / 9);

  // Act 1: Full establishing shot with generous lanyard clearance
  assert.ok(fullStart.position.z > 76, `Expected Full Z > 76, got ${fullStart.position.z}`);
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

test('Zero-hiccup C1 continuity across every scene boundary and loop seam in cinematic-reel & cinematic-360', () => {
  const checkContinuity = (
    sample: (u: number) => { x: number; y: number; z: number; ty: number },
    steps: number,
    maxAccel: number,
    label: string
  ) => {
    const pts = Array.from({ length: steps }, (_, i) => sample(i / steps));
    for (let i = 0; i < steps; i++) {
      const prev = pts[(i - 1 + steps) % steps];
      const curr = pts[i];
      const next = pts[(i + 1) % steps];

      // Second finite difference measures velocity jump (hiccup/kink) at frame i (including loop seam i=0!)
      const ddx = next.x - 2 * curr.x + prev.x;
      const ddy = next.y - 2 * curr.y + prev.y;
      const ddz = next.z - 2 * curr.z + prev.z;
      const ddTy = next.ty - 2 * curr.ty + prev.ty;
      const accelMag = Math.hypot(ddx, ddy, ddz, ddTy);

      assert.ok(
        accelMag < maxAccel,
        `${label}: detected velocity hiccup (${accelMag.toFixed(4)} >= ${maxAccel}) at frame ${i}/${steps}`
      );
    }
  };

  checkContinuity(
    (u) => {
      const p = evaluateHermiteCameraPath(u, 16 / 9, true);
      return { x: p.position.x, y: p.position.y, z: p.position.z, ty: p.target.y };
    },
    960,
    0.04,
    'cinematic-reel'
  );

  checkContinuity(
    (u) => {
      const c = evaluateCompleteShowcaseFrame(u, 16 / 9);
      return {
        x: c.cameraPose.position.x,
        y: c.cameraPose.position.y,
        z: c.cameraPose.position.z,
        ty: c.cameraPose.target.y,
      };
    },
    1440,
    0.04,
    'cinematic-360'
  );
});

test('Temporal supersampling shutter kernel builds normalized filmic weights & fractional sub-frame stepping is stateless', () => {
  const off = buildTemporalShutterSamples('off', 180);
  assert.equal(off.length, 1);
  assert.equal(off[0].offsetFrames, 0);
  assert.equal(off[0].weight, 1);

  for (const [quality, expectedCount] of [
    ['cinema', 8],
    ['ultra', 12],
  ] as const) {
    const samples = buildTemporalShutterSamples(quality, 180);
    assert.equal(samples.length, expectedCount);
    const weightSum = samples.reduce((acc, s) => acc + s.weight, 0);
    assert.ok(Math.abs(weightSum - 1.0) < 1e-9, `Expected weights sum=1, got ${weightSum}`);

    // Symmetric around frame center with higher center weight than shutter edges (no ghosting)
    assert.ok(Math.abs(samples[0].offsetFrames + samples[samples.length - 1].offsetFrames) < 1e-9);
    const centerIdx = Math.floor(samples.length / 2);
    assert.ok(
      samples[centerIdx].weight > samples[0].weight,
      'Center shutter sample should carry higher weight than edge sample'
    );
  }

  // Stateless fractional sub-frame evaluation works identically regardless of previous state
  const dummy = createInitialSpringState();
  for (const preset of ['cinematic-reel', 'cinematic-360', 'pendulum-flip', 'turntable'] as const) {
    const a = stepOfflinePresetFrame(dummy, preset, 160.25, 960, 60, 16 / 9);
    const b = stepOfflinePresetFrame(a, preset, 160.25, 960, 60, 16 / 9);
    assert.equal(a.thetaY, b.thetaY);
    assert.equal(a.turntableY, b.turntableY);
    assert.equal(a.simTime, b.simTime);
  }
});

test('12MP tiled rendering covers every pixel exactly once within GPU tile bounds and RGSS weights sum to 1', () => {
  const rgssSum = STILL_RGSS_OFFSETS.reduce((acc, s) => acc + s.weight, 0);
  assert.ok(Math.abs(rgssSum - 1.0) < 1e-9);

  for (const ratio of ['16:9', '9:16', '1:1'] as const) {
    const spec = STILL_12MP_RESOLUTIONS[ratio];
    const megapixels = (spec.width * spec.height) / 1_000_000;
    assert.ok(megapixels >= 11.9 && megapixels <= 12.1, `Expected ~12MP for ${ratio}, got ${megapixels}`);

    const tiles = computeRenderTiles(spec.width, spec.height, 1536);
    assert.ok(tiles.length >= 6);

    let areaSum = 0;
    for (const tile of tiles) {
      assert.ok(tile.width > 0 && tile.width <= 1536);
      assert.ok(tile.height > 0 && tile.height <= 1536);
      assert.ok(tile.x >= 0 && tile.x + tile.width <= spec.width);
      assert.ok(tile.y >= 0 && tile.y + tile.height <= spec.height);
      areaSum += tile.width * tile.height;
    }
    assert.equal(areaSum, spec.width * spec.height, 'Tiles must partition 12MP canvas with zero gaps or overlaps');
  }
});

