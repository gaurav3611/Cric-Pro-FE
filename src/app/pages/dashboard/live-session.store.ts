import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ShotHistoryService } from '../../analysis/shot-history.service';
import {
  KpiBadge,
  SensorSample,
  SessionSummary,
  Shot,
  ShotDirection,
  accelMagnitude,
  analyzeSwing,
  axisBarWidth,
  directionOf,
  instantSpeedKmh,
  kpisForShot,
  smoothSpeed,
  summariseSession,
  swingScore,
} from '../../analysis/swing-analysis';
import { SwingDetector } from '../../analysis/swing-detector';
import { ToastService } from '../../core/toast.service';
import { PALETTE } from '../../shared/palette';
import { BluetoothService } from '../../sensor/bluetooth.service';
import { DEMO_TICK_MS, demoSample } from '../../sensor/demo-data';
import { IconName } from '../../shared/icon-data';

export interface LogEntry {
  icon: IconName;
  message: string;
  time: string;
}

export interface KpiState {
  speed: string;
  impact: string;
  control: string;
  follow: string;
}

export interface BadgeState {
  speed: KpiBadge;
  impact: KpiBadge;
  control: KpiBadge;
  follow: KpiBadge;
}

type Axis = 'gx' | 'gy' | 'gz' | 'ax' | 'ay' | 'az';

export interface AxisState {
  value: Record<Axis, string>;
  width: Record<Axis, string>;
}

export interface DirectionState {
  active: ShotDirection | null;
  label: string;
  colour: string | null;
  left: string | null;
  top: string | null;
}

export interface ScoreState {
  num: number;
  /** null until the first score, so the ring keeps the look its stylesheet gives it. */
  offset: number | null;
  colour: string | null;
  label: string;
}

const allBadges = (text: string): BadgeState => ({
  speed: { text, cls: '' },
  impact: { text, cls: '' },
  control: { text, cls: '' },
  follow: { text, cls: '' },
});

const EMPTY_KPI: KpiState = { speed: '--', impact: '--', control: '--', follow: '--' };
const DIRECTION_LABEL: Record<ShotDirection, [string, string]> = {
  leg: ['LEG SIDE', PALETTE.leg],
  off: ['OFF SIDE', PALETTE.ochre],
  straight: ['STRAIGHT DRIVE', PALETTE.green],
};
/** Full scale of the bars under "Gyroscope Axes" and "Accelerometer". The original's numbers. */
const GYRO_BAR_MAX = 10;
const ACCEL_BAR_MAX = 20;

const MANUAL_HELP =
  'Click START SHOT, swing the bat, then click STOP & SAVE SHOT. Everything between the two clicks is saved as one shot.';
const AUTO_HELP =
  'Auto record is on: swing the bat and each shot is saved by itself. START SHOT still works.';

function readSetting(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage blocked, for example in a private window: the setting lasts for this visit only.
  }
}

/**
 * Everything the live view knows and does: the sensor, recording shots, the numbers on screen.
 *
 * This is the state and the functions of the original dashboard's inline script, moved into
 * one class. One instance belongs to one visit of the dashboard page. Leaving the dashboard
 * throws it away, as reloading the original page did.
 *
 * What is drawn on a canvas, the two charts and the 3D bat, is not handled here. The live
 * view listens to the three event streams below and draws.
 */
@Injectable()
export class LiveSessionStore {
  private readonly toast = inject(ToastService);
  private readonly bluetooth = inject(BluetoothService);
  private readonly history = inject(ShotHistoryService);

  // ---- header
  readonly sensorOn = signal(false);
  readonly sensorText = signal('NO SENSOR');
  /** Settings, kept in the browser between visits. */
  readonly autoRecord = signal(readSetting('sswingg.autoRecord', false));
  readonly trackBattery = signal(readSetting('sswingg.trackBattery', true));
  /** Battery percent of the connected bat, or null when it reports none. */
  readonly batteryPercent = signal<number | null>(null);
  readonly statusLive = signal(false);
  readonly statusText = signal('STANDBY');
  readonly liveMode = signal('');

  // ---- live view
  readonly recording = signal(false);
  readonly swingStatus = signal('READY TO SWING');
  readonly swingHelp = signal(this.autoRecord() ? AUTO_HELP : MANUAL_HELP);
  readonly shots = signal<Shot[]>([]);
  readonly shotCount = computed(() => this.shots().length);
  readonly kpiActive = signal(false);
  readonly kpi = signal<KpiState>(EMPTY_KPI);
  readonly badges = signal<BadgeState>(allBadges('WAITING'));
  readonly score = signal<ScoreState>({ num: 0, offset: null, colour: null, label: 'READY' });
  readonly axes = signal<AxisState>({
    value: { gx: '0.00', gy: '0.00', gz: '0.00', ax: '0.00', ay: '0.00', az: '0.00' },
    width: { gx: '0%', gy: '0%', gz: '0%', ax: '0%', ay: '0%', az: '0%' },
  });
  readonly direction = signal<DirectionState>({
    active: null,
    label: '--',
    colour: null,
    left: null,
    top: null,
  });
  readonly log = signal<LogEntry[]>([{ icon: 'info', message: 'SSwinGG ready', time: '--:--' }]);
  readonly summary = signal<SessionSummary | null>(null);
  readonly chartNavInfo = signal('Showing live data');

  // ---- events for the parts that draw on a canvas
  /** A reading was taken into the session. */
  readonly sampleProcessed = new Subject<{ sample: SensorSample; acc: number }>();
  /** The first shot of a session is starting: empty both charts. */
  readonly chartsCleared = new Subject<void>();
  /** A shot is starting: put the 3D bat back to rest. */
  readonly batReset = new Subject<void>();
  /** The dashboard should switch to this view. */
  readonly viewRequested = new Subject<'home' | 'live'>();

  // ---- session data, read by the speed chart
  /** Smoothed speed of every reading of the session. Never shortened. */
  speedData: number[] = [];
  accelData: number[] = [];
  /** First reading shown by the speed chart, or -1 to follow the newest readings. */
  chartViewStart = -1;

  private sessionData: SensorSample[] = [];
  private currentSwing: SensorSample[] = [];
  private smoothedSpeed = 0;
  /** A sensor, real or simulated, is available. */
  private sensorActive = false;
  private demoRunning = false;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private readonly detector = new SwingDetector();

  // ------------------------------------------------------------------ settings

  setAutoRecord(on: boolean): void {
    this.autoRecord.set(on);
    writeSetting('sswingg.autoRecord', on);
    this.detector.reset();
    if (!this.recording()) this.swingHelp.set(on ? AUTO_HELP : MANUAL_HELP);
    this.logEvent('info', on ? 'Auto record on' : 'Auto record off');
  }

  setTrackBattery(on: boolean): void {
    this.trackBattery.set(on);
    writeSetting('sswingg.trackBattery', on);
  }

  // ------------------------------------------------------------------ demo mode

  startDemoMode(): void {
    this.viewRequested.next('live');
    this.liveMode.set('(DEMO MODE)');
    this.statusLive.set(true);
    this.statusText.set('DEMO');
    this.sensorOn.set(true);
    this.sensorText.set('DEMO BAT');
    this.sensorActive = true;
    this.demoRunning = true;
    this.toast.show('Demo mode is on. Click START SHOT to record a swing.', 'info');
    this.logEvent('play', 'Demo mode on');
  }

  private stopDemoSimulation(): void {
    this.demoRunning = false;
    this.clearDemoTimer();
    this.statusLive.set(false);
    this.statusText.set('STANDBY');
    if (!this.bluetooth.connected) {
      this.sensorOn.set(false);
      this.sensorText.set('NO SENSOR');
      this.sensorActive = false;
    }
  }

  /** Simulated readings arrive every 25 ms while a shot is being recorded. */
  private startDemoData(): void {
    let tick = 0;
    this.demoTimer = setInterval(() => {
      if (!this.recording()) return;
      this.processData(demoSample(tick));
      tick++;
    }, DEMO_TICK_MS);
  }

  private clearDemoTimer(): void {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
  }

  // ------------------------------------------------------------------ Bluetooth

  async connectBluetooth(): Promise<void> {
    if (!this.bluetooth.supported) {
      this.toast.show('This browser has no Web Bluetooth. Use Chrome or Edge.', 'error');
      return;
    }
    try {
      this.logEvent('bluetooth', 'Scanning for SSwinGG devices...');
      const name = await this.bluetooth.connect({
        progress: (message) => this.logEvent('bluetooth', message),
        sample: (sample) => this.processData(sample),
        // 0 is what the firmware sends when it sees no battery, for example on USB with the switch off.
        battery: (percent) => this.batteryPercent.set(percent > 0 ? percent : null),
        disconnected: () => this.onDisconnected(),
      });
      this.sensorActive = true;
      this.sensorOn.set(true);
      this.sensorText.set(name || 'CONNECTED');
      this.viewRequested.next('live');
      this.liveMode.set('(BLUETOOTH)');
      this.toast.show('Connected to ' + (name || 'the sensor'), 'success');
      this.logEvent('check', 'Bluetooth connected');
    } catch (error) {
      const failure = error as Error;
      if (failure.name !== 'NotFoundError') {
        this.toast.show('Bluetooth error: ' + failure.message, 'error');
      }
    }
  }

  private onDisconnected(): void {
    this.sensorActive = false;
    this.sensorOn.set(false);
    this.sensorText.set('NO SENSOR');
    this.batteryPercent.set(null);
    this.detector.reset();
    this.statusLive.set(false);
    this.statusText.set('STANDBY');
    this.toast.show('Bluetooth disconnected', 'info');
    this.logEvent('triangle-alert', 'Bluetooth disconnected.');
  }

  /** For tools/parity.mjs: behave as if a sensor with this name had just connected. */
  simulateSensor(name: string): void {
    this.sensorActive = true;
    this.sensorOn.set(true);
    this.sensorText.set(name);
    this.viewRequested.next('live');
    this.liveMode.set('(BLUETOOTH)');
  }

  // ------------------------------------------------------------------ recording shots

  /** START SHOT. One shot is everything between this and stopShot(). */
  startShot(): void {
    if (!this.sensorActive && !this.demoRunning) {
      this.toast.show('Connect the sensor or start the demo first.', 'error');
      return;
    }

    this.recording.set(true);
    this.currentSwing = [];
    this.smoothedSpeed = 0;

    // The charts are emptied only for the first shot of a session.
    if (this.shots().length === 0) {
      this.sessionData = [];
      this.speedData = [];
      this.accelData = [];
      this.chartsCleared.next();
    }
    this.chartViewStart = -1;

    const number = this.shots().length + 1;
    this.statusLive.set(true);
    this.statusText.set('RECORDING');
    this.swingStatus.set('RECORDING SHOT #' + number);
    this.swingHelp.set('Swing the bat, then click STOP & SAVE SHOT.');
    this.kpiActive.set(true);
    this.kpi.set(EMPTY_KPI);
    this.badges.set(allBadges('RECORDING'));
    this.batReset.next();

    if (this.demoRunning && !this.demoTimer) {
      this.startDemoData();
    }

    this.logEvent('play', 'Shot #' + number + ' recording started');
    this.toast.show('Recording shot #' + number, 'info');
  }

  /** STOP & SAVE SHOT. Analyses the readings since startShot() and keeps the result. */
  stopShot(): void {
    if (!this.recording()) return;
    this.recording.set(false);
    this.clearDemoTimer();
    this.statusLive.set(false);

    const shot = analyzeSwing(this.currentSwing, this.shots().length + 1, this.speedData.length);
    this.shots.update((all) => [...all, shot]);
    const count = this.shots().length;

    this.swingStatus.set('SHOT #' + count + ' SAVED: ' + shot.peakSpeed.toFixed(1) + ' km/h');
    this.swingHelp.set(
      'Click START SHOT for the next one, or click a shot card to see its details.',
    );
    this.statusText.set('READY');

    const kpis = kpisForShot(shot);
    this.kpi.set({
      speed: kpis.speed,
      impact: kpis.impact,
      control: kpis.control,
      follow: kpis.follow,
    });
    this.badges.set(kpis.badges);

    this.showSessionSummary();
    this.history.save(shot);

    this.logEvent(
      'check',
      'Shot #' +
        count +
        ': ' +
        shot.peakSpeed.toFixed(1) +
        ' km/h | ' +
        shot.direction.toUpperCase(),
    );
    this.toast.show('Shot #' + count + ' saved: ' + shot.peakSpeed.toFixed(1) + ' km/h', 'success');
  }

  /** Leaving the live view: stops the demo and ends a shot that is still being recorded, without saving it. */
  leaveLiveView(): void {
    if (this.demoRunning) this.stopDemoSimulation();
    if (this.recording()) this.endSession();
    this.viewRequested.next('home');
  }

  private endSession(): void {
    this.recording.set(false);
    this.clearDemoTimer();
    this.statusLive.set(false);
    this.statusText.set('COMPLETE');
    const count = this.shots().length;
    this.swingStatus.set('SESSION COMPLETE: ' + count + ' SHOTS RECORDED');
    this.swingHelp.set('Click a shot card to see its details.');
    if (count > 0) this.showSessionSummary();
    this.logEvent('check', 'Session ended with ' + count + ' shots');
    this.toast.show('Session ended. Shots recorded: ' + count, 'success');
  }

  private showSessionSummary(): void {
    const summary = summariseSession(this.shots(), this.sessionData.length);
    this.summary.set(summary);
    this.setScore(summary.bestSpeed, summary.avgAccuracy);
  }

  private setScore(speed: number, metric2: number): void {
    const result = swingScore(speed, metric2);
    this.score.set({
      num: result.score,
      offset: result.offset,
      colour: result.colour,
      label: result.label,
    });
  }

  // ------------------------------------------------------------------ readings

  /** Takes one reading from the sensor. Outside a shot it only goes to the swing detector, when auto record is on. */
  processData(sample: SensorSample): void {
    if (!this.recording()) {
      if (this.autoRecord() && this.sensorActive) {
        const swing = this.detector.push(sample);
        if (swing) this.recordAutoShot(swing);
      }
      return;
    }

    this.sessionData.push(sample);
    this.currentSwing.push(sample);

    this.smoothedSpeed = smoothSpeed(this.smoothedSpeed, instantSpeedKmh(sample));
    const acc = accelMagnitude(sample);
    this.speedData.push(+this.smoothedSpeed.toFixed(1));
    this.accelData.push(+acc.toFixed(2));

    this.sampleProcessed.next({ sample, acc });

    this.axes.set({
      value: {
        gx: sample.gx.toFixed(2),
        gy: sample.gy.toFixed(2),
        gz: sample.gz.toFixed(2),
        ax: sample.ax.toFixed(2),
        ay: sample.ay.toFixed(2),
        az: sample.az.toFixed(2),
      },
      width: {
        gx: axisBarWidth(sample.gx, GYRO_BAR_MAX),
        gy: axisBarWidth(sample.gy, GYRO_BAR_MAX),
        gz: axisBarWidth(sample.gz, GYRO_BAR_MAX),
        ax: axisBarWidth(sample.ax, ACCEL_BAR_MAX),
        ay: axisBarWidth(sample.ay, ACCEL_BAR_MAX),
        az: axisBarWidth(sample.az, ACCEL_BAR_MAX),
      },
    });

    const direction = directionOf(sample.gz);
    this.direction.set({
      active: direction,
      label: DIRECTION_LABEL[direction][0],
      colour: DIRECTION_LABEL[direction][1],
      left: 50 + Math.tanh(sample.gz) * 35 + '%',
      top: 50 - Math.tanh(Math.abs(sample.gx)) * 30 + '%',
    });

    this.kpi.update((kpi) => ({
      ...kpi,
      speed: this.smoothedSpeed.toFixed(1),
      impact: acc.toFixed(1),
    }));
  }

  /** A swing the detector found goes through START SHOT and STOP & SAVE SHOT, like one recorded by hand. */
  private recordAutoShot(swing: SensorSample[]): void {
    this.startShot();
    swing.forEach((sample) => this.processData(sample));
    this.stopShot();
    this.swingHelp.set(AUTO_HELP);
  }

  // ------------------------------------------------------------------ event log

  logEvent(icon: IconName, message: string): void {
    const now = new Date();
    const time =
      String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    this.log.update((entries) => [{ icon, message, time }, ...entries]);
  }

  /** Called when the dashboard page goes away. */
  destroy(): void {
    this.clearDemoTimer();
    this.bluetooth.disconnect();
  }
}
