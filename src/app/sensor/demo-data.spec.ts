import { demoSample } from './demo-data';

describe('demoSample', () => {
  const half = () => 0.5;

  it('is quiet during the backlift', () => {
    expect(demoSample(0, half)).toEqual({ ax: 0, ay: 1, az: 0, gx: 0, gy: 7.5, gz: 0 });
  });

  it('peaks in the middle of the swing', () => {
    const s = demoSample(30, half); // halfway through the swing part of the cycle
    expect(s.gy).toBeCloseTo(650, 9);
    expect(s.gx).toBeCloseTo(-195, 9);
    expect(s.ax).toBeCloseTo(8, 9);
    expect(s.gz).toBeCloseTo(0, 9);
  });

  it('fades out in the follow-through and repeats every 80 ticks', () => {
    const start = demoSample(40, half);
    expect(start.gx).toBeCloseTo(-40, 9);
    expect(start.gy).toBeCloseTo(60, 9);
    expect(start.ay).toBeCloseTo(1.5, 9);
    expect(demoSample(79, half).gy).toBeCloseTo(0, 9);
    expect(demoSample(80, half)).toEqual(demoSample(0, half));
  });

  it('chooses leg, straight or off side for a swing', () => {
    const at = (r: number) => demoSample(30, () => r).gz;
    expect(at(0.1)).toBeLessThan(0);
    expect(at(0.5)).toBeCloseTo(0, 9);
    expect(at(0.9)).toBeGreaterThan(0);
  });
});
