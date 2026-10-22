import { Injectable } from '@angular/core';
import { SensorSample } from '../analysis/swing-analysis';
import {
  BLE_NAME_PREFIX,
  BLE_SENSOR_UUID,
  BLE_SERVICE_UUID,
  decodeSensorPacket,
} from './sensor-packet';

export interface BluetoothHandlers {
  /** Called at each step of connecting, with a line for the event log. */
  progress: (message: string) => void;
  sample: (sample: SensorSample) => void;
  /** Called with the battery level in percent, only when the bat reports one. */
  battery: (percent: number) => void;
  disconnected: () => void;
}

/** The bat sensor over Web Bluetooth. Works in Chrome and Edge, on https or localhost. */
@Injectable({ providedIn: 'root' })
export class BluetoothService {
  private device: BluetoothDevice | null = null;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  /** True while a real sensor is connected. */
  get connected(): boolean {
    return !!this.device?.gatt?.connected;
  }

  /**
   * Lets the user pick a sensor and starts receiving its readings.
   * Resolves with the device's name. Rejects with a NotFoundError when the user picks nothing.
   */
  async connect(handlers: BluetoothHandlers): Promise<string> {
    const device = await navigator.bluetooth.requestDevice({
      // 'SwingLab' is for bats flashed before the rename.
      filters: [{ namePrefix: BLE_NAME_PREFIX }, { namePrefix: 'SwingLab' }, { services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID, 'battery_service'],
    });
    this.device = device;

    handlers.progress('Found: ' + (device.name || 'Unknown'));
    device.addEventListener('gattserverdisconnected', () => handlers.disconnected());

    handlers.progress('Connecting to GATT server...');
    const server = await device.gatt!.connect();

    handlers.progress('Getting sensor service...');
    const service = await server.getPrimaryService(BLE_SERVICE_UUID);

    handlers.progress('Getting sensor characteristic...');
    const characteristic = await service.getCharacteristic(BLE_SENSOR_UUID);

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      const sample = value ? decodeSensorPacket(value) : null;
      if (sample) handlers.sample(sample);
    });

    await this.subscribeBattery(server, handlers.battery);
    return device.name || '';
  }

  /** The standard battery level, sent only by firmware built with HAS_BATTERY_SENSE 1. */
  private async subscribeBattery(server: BluetoothRemoteGATTServer, report: (percent: number) => void): Promise<void> {
    try {
      const level = await (await server.getPrimaryService('battery_service')).getCharacteristic('battery_level');
      level.addEventListener('characteristicvaluechanged', () => {
        if (level.value) report(level.value.getUint8(0));
      });
      report((await level.readValue()).getUint8(0));
      await level.startNotifications();
    } catch {
      // No battery service on this bat. The sensor works without it.
    }
  }

  disconnect(): void {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }
}
