import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSpringState,
  stepLiveSimulation,
  stepOfflinePresetFrame,
  stepOscillator,
} from './physicsEngine';

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

test('offline simulation stepping is 100% deterministic across independent runs', () => {
  let runA = createInitialSpringState();
  let runB = createInitialSpringState();

  const totalFrames = 240;
  for (let f = 0; f < totalFrames; f++) {
    runA = stepOfflinePresetFrame(runA, 'pendulum-flip', f, totalFrames, 60);
    runB = stepOfflinePresetFrame(runB, 'pendulum-flip', f, totalFrames, 60);

    assert.equal(runA.thetaY, runB.thetaY);
    assert.equal(runA.thetaX, runB.thetaX);
    assert.equal(runA.thetaZ, runB.thetaZ);
    assert.equal(runA.turntableY, runB.turntableY);
    assert.equal(runA.neckSwayZ, runB.neckSwayZ);
  }
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
