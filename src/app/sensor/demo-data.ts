import { SensorSample } from '../analysis/swing-analysis';

/** The demo sends a reading every 25 ms. */
export const DEMO_TICK_MS = 25;

/**
 * One reading of the simulated bat. Tick t runs through an 80-tick cycle: a quiet backlift,
 * one swing with a single peak, and a follow-through that fades out.
 * `random` is a parameter so tests can make it predictable.
 */
export function demoSample(t: number, random: () => number = Math.random): SensorSample {
  const phase = (t % 80) / 80.0;

  if (phase < 0.25) {
    return {
      ax: random() * 0.5 - 0.25,
      ay: 0.9 + random() * 0.2,
      az: random() * 0.4 - 0.2,
      gx: Math.sin(phase * 8) * 15,
      gy: 5 + random() * 5,
      gz: (random() - 0.5) * 8,
    };
  }

  if (phase < 0.5) {
    const swingProgress = (phase - 0.25) / 0.25;
    const intensity = Math.sin(swingProgress * Math.PI);
    const peakGyro = 400 + random() * 500; // 400 to 900 degrees per second
    return {
      ax: intensity * 8,
      ay: intensity * 6,
      az: intensity * 4,
      gx: -intensity * peakGyro * 0.3,
      gy: intensity * peakGyro,
      gz: [-1.5, 0, 1.5][Math.floor(random() * 3)] * intensity * peakGyro * 0.15,
    };
  }

  const decay = Math.max(0, 1 - (phase - 0.5) * 3);
  return {
    ax: decay * random() * 2,
    ay: 1 + decay * 0.5,
    az: decay * (random() - 0.5),
    gx: -decay * 40,
    gy: decay * 60,
    gz: (random() - 0.5) * decay * 20,
  };
}
