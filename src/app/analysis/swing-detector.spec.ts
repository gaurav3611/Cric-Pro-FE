import { SwingDetector } from './swing-detector';

/** A reading whose bat speed is about `kmh`. 1 degree per second is 0.0534 km/h. */
const at = (kmh: number) => ({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: kmh / 0.0534 });

function feed(detector: SwingDetector, speeds: number[]) {
  const found: number[] = [];
  speeds.forEach((kmh) => {
    const swing = detector.push(at(kmh));
    if (swing) found.push(swing.length);
  });
  return found;
}

const still = (n: number) => Array(n).fill(0);
const moving = (n: number, kmh: number) => Array(n).fill(kmh);

describe('SwingDetector', () => {
  it('finds one swing, with the second before it, and ends it after half a second of stillness', () => {
    const found = feed(new SwingDetector(), [...still(100), ...moving(30, 40), ...still(30)]);
    // 50 kept from before (the last of them starts it), 29 more moving, 25 still that end it
    expect(found).toEqual([104]);
  });

  it('ignores slow waggles and short knocks', () => {
    expect(feed(new SwingDetector(), [...still(60), ...moving(30, 11), ...still(30)])).toEqual([]);
    expect(feed(new SwingDetector(), [...still(60), ...moving(5, 60), ...still(30)])).toEqual([]);
  });

  it('does not count the settling after a swing as a new one', () => {
    const found = feed(new SwingDetector(), [
      ...still(60),
      ...moving(30, 40),
      ...still(26),
      ...moving(20, 30),
      ...still(30),
    ]);
    expect(found).toEqual([104]);
  });

  it('cuts a swing after 3 seconds and finds the next after the pause', () => {
    const found = feed(new SwingDetector(), [
      ...still(60),
      ...moving(200, 40),
      ...still(80),
      ...moving(30, 40),
      ...still(30),
    ]);
    expect(found.length).toBe(2);
    expect(found[0]).toBe(50 + 149);
  });
});
