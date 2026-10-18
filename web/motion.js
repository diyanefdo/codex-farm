(function (root) {
  'use strict';

  const CYCLE = 6000;
  const TAU = Math.PI * 2;

  function resting() {
    return {x: 0, y: 0, armLeft: 0, armRight: 0, step: 0, facing: 1, activity: 'resting'};
  }

  /**
   * Return a small pixel-art pose for a desk occupant. Tick is animation-frame
   * time in milliseconds; index staggers workers so an office feels inhabited.
   * Positions and arms are integer pixel offsets. Roles do not affect motion:
   * managers and agents move only while their recorded state is "working".
   * No state is retained, so redraws, tests and reduced motion stay predictable.
   */
  function workerMotion(worker, tick, index = 0, enabled = true) {
    if (!enabled || !worker || worker.state !== 'working' ||
        !Number.isFinite(tick) || tick <= 0) return resting();

    const offset = Number.isFinite(index) ? Math.trunc(index) * 1273 : 0;
    const phase = ((tick + offset) % CYCLE + CYCLE) % CYCLE;

    if (phase < 4000) {
      const tap = Math.floor(phase / 140) % 2;
      return {
        x: Math.round(4 * Math.sin(TAU * phase / 1100)),
        y: Math.round(2 * Math.sin(TAU * phase / 560)),
        armLeft: tap ? -3 : 2,
        armRight: tap ? 2 : -3,
        step: 0,
        facing: 1,
        activity: 'typing'
      };
    }

    if (phase < 4900) {
      const progress = (phase - 4000) / 900;
      const lift = Math.sin(Math.PI * progress);
      return {
        x: Math.round(3 * Math.sin(TAU * progress)),
        y: -Math.round(2 * lift),
        armLeft: -Math.round(5 * lift),
        armRight: -Math.round(5 * lift),
        step: 0,
        facing: 1,
        activity: 'stretching'
      };
    }

    const progress = (phase - 4900) / 1100;
    const step = Math.floor(phase / 90) % 2;
    return {
      x: Math.round(8 * Math.sin(TAU * progress)),
      y: Math.round(3 * Math.sin(Math.PI * progress)),
      armLeft: step ? 3 : -3,
      armRight: step ? -3 : 3,
      step,
      facing: Math.cos(TAU * progress) >= 0 ? 1 : -1,
      activity: 'pacing'
    };
  }

  root.workerMotion = workerMotion;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {workerMotion};
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
