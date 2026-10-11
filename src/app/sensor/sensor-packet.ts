import { SensorSample } from '../analysis/swing-analysis';

/** Must match the bat firmware. */
export const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const BLE_SENSOR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const BLE_NAME_PREFIX = 'SwingLab';

/** Raw counts per g at the sensor's +-8 g range. */
const ACCEL_COUNTS_PER_G = 4096.0;
/** Raw counts per degree per second at the sensor's +-2000 degrees per second range. */
const GYRO_COUNTS_PER_DPS = 16.4;

/**
 * Turns one Bluetooth packet into a reading. The packet holds seven 16-bit numbers, low byte
 * first: ax, ay, az, gx, gy, gz and a temperature that is not used. Returns null for a packet
 * that is too short.
 */
export function decodeSensorPacket(view: DataView): SensorSample | null {
  if (view.byteLength < 14) return null;
  return {
    ax: view.getInt16(0, true) / ACCEL_COUNTS_PER_G,
    ay: view.getInt16(2, true) / ACCEL_COUNTS_PER_G,
    az: view.getInt16(4, true) / ACCEL_COUNTS_PER_G,
    gx: view.getInt16(6, true) / GYRO_COUNTS_PER_DPS,
    gy: view.getInt16(8, true) / GYRO_COUNTS_PER_DPS,
    gz: view.getInt16(10, true) / GYRO_COUNTS_PER_DPS,
  };
}
