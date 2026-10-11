import { decodeSensorPacket } from './sensor-packet';

const packet = (hex: string) =>
  new DataView(Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))).buffer);

describe('decodeSensorPacket', () => {
  // These byte strings were produced by the bat firmware's own packet builder
  // (Cricket/firmware/esp32c3-bmi160/03_swinglab_bat/swing_packet.h) for known sensor values.
  it('reads packets built by the bat firmware', () => {
    expect(decodeSensorPacket(packet('0000000000100000000000000000'))).toEqual({
      ax: 0,
      ay: 0,
      az: 1,
      gx: 0,
      gy: 0,
      gz: 0,
    });
    const mixed = decodeSensorPacket(packet('001000e000081040f8dfa4000002'))!;
    expect(mixed.ax).toBe(1);
    expect(mixed.ay).toBe(-2);
    expect(mixed.az).toBe(0.5);
    expect(mixed.gx).toBeCloseTo(1000, 9);
    expect(mixed.gy).toBeCloseTo(-500, 9);
    expect(mixed.gz).toBeCloseTo(10, 9);
  });

  it('reads the sensor limits', () => {
    const limits = decodeSensorPacket(packet('ff7f00800000ff7f00800000ffff'))!;
    expect(limits.ax).toBeCloseTo(8, 3);
    expect(limits.ay).toBe(-8);
    expect(limits.gx).toBeCloseTo(1998, 0);
    expect(limits.gy).toBeCloseTo(-1998, 0);
  });

  it('ignores a packet that is too short and accepts a longer one', () => {
    expect(decodeSensorPacket(new DataView(new ArrayBuffer(13)))).toBeNull();
    expect(decodeSensorPacket(new DataView(new ArrayBuffer(20)))).toEqual({
      ax: 0,
      ay: 0,
      az: 0,
      gx: 0,
      gy: 0,
      gz: 0,
    });
  });
});
