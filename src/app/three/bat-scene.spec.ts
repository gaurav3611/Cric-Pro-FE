import { Color } from 'three';
import { PALETTE } from '../shared/palette';
import { speedColour } from './bat-scene';

describe('speedColour', () => {
  const hex = (kmh: number) => '#' + speedColour(kmh).getHexString();

  it('is green when the bat is still, ochre at 60 km/h and red from 120 km/h', () => {
    expect(hex(0)).toBe(PALETTE.green);
    expect(hex(60)).toBe(PALETTE.ochre);
    expect(hex(120)).toBe(PALETTE.red);
    expect(hex(180)).toBe(PALETTE.red);
  });

  it('blends between them', () => {
    const mid = speedColour(30);
    const green = new Color(PALETTE.green);
    const ochre = new Color(PALETTE.ochre);
    expect(mid.r).toBeCloseTo((green.r + ochre.r) / 2, 5);
  });
});
