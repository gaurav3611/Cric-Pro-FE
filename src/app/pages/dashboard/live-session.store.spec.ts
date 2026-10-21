import { TestBed } from '@angular/core/testing';
import { ShotHistoryService } from '../../analysis/shot-history.service';
import { goldenShots, goldenSteps, reworded, stepAfterShot } from '../../testing/golden';
import { useMemoryStorage } from '../../testing/memory-storage';
import { LiveSessionStore } from './live-session.store';
import { BluetoothHandlers, BluetoothService } from '../../sensor/bluetooth.service';

/**
 * Runs the recorded scenario through the store, with no browser and no canvas, and checks
 * that the store holds what the original page showed at each step. Texts are compared through
 * reworded(), which applies the wording this app changed on purpose and nothing else.
 */
describe('LiveSessionStore, against the recording of the original dashboard', () => {
  let store: LiveSessionStore;

  beforeEach(() => {
    useMemoryStorage();
    TestBed.configureTestingModule({ providers: [LiveSessionStore] });
    store = TestBed.inject(LiveSessionStore);
  });

  afterEach(() => store.destroy());

  const logLines = () => store.log().map((entry) => entry.icon + ' ' + entry.message);

  it('refuses to record without a sensor', () => {
    store.startShot();
    expect(store.recording()).toBe(false);
    expect(store.swingStatus()).toBe('READY TO SWING');
  });

  it('starts with an empty direction label and one line in the event log', () => {
    expect(store.direction().label).toBe('--');
    expect(logLines()).toEqual(['info SwingLab ready']);
  });

  it('ignores readings that arrive outside a shot', () => {
    store.simulateSensor('TEST BAT');
    store.processData(goldenShots[0].samples[5]);
    expect(store.speedData).toEqual([]);
    expect(store.kpi().speed).toBe('--');
  });

  it('shows the same values as the original through all recorded shots', () => {
    const views: string[] = [];
    store.viewRequested.subscribe((view) => views.push(view));
    store.simulateSensor('TEST BAT');
    expect(views).toEqual(['live']);
    expect(store.sensorText()).toBe('TEST BAT');
    expect(store.liveMode()).toBe('(BLUETOOTH)');

    goldenShots.forEach((recorded, index) => {
      const number = index + 1;

      store.startShot();
      const started = goldenSteps.find((s) => s.name.startsWith(`shot ${number} (`))!;
      expect(store.swingStatus()).toBe(
        reworded('text.swingStatusText', started.page.text['swingStatusText']),
      );
      expect(store.swingHelp()).toBe(
        reworded('text.swingHelpText', started.page.text['swingHelpText']),
      );
      expect(store.statusText()).toBe(started.page.text['statusText']);
      expect(store.badges().speed.text).toBe(started.page.text['badgeSpeed']);
      expect(store.kpiActive()).toBe(true);

      const half = Math.ceil(recorded.samples.length / 2);
      recorded.samples.slice(0, half).forEach((sample) => store.processData(sample));
      const midway = goldenSteps.find((s) => s.name === `shot ${number}: half of the readings in`);
      if (midway) {
        expect(store.kpi().speed + 'km/h').toBe(midway.page.text['valSpeed']);
        expect(store.kpi().impact + 'g').toBe(midway.page.text['valImpact']);
        for (const axis of ['gx', 'gy', 'gz', 'ax', 'ay', 'az'] as const) {
          expect(store.axes().value[axis]).toBe(midway.page.text[axis + 'Val']);
          // The browser shortens "100.0%" to "100%", so the widths are compared as numbers.
          expect(parseFloat(store.axes().width[axis])).toBeCloseTo(
            parseFloat(midway.page.style[axis + 'Bar'] as string),
            6,
          );
        }
        expect(store.direction().label).toBe(
          reworded('text.shotLabel', midway.page.text['shotLabel']),
        );
      }
      recorded.samples.slice(half).forEach((sample) => store.processData(sample));

      store.stopShot();
      const stopped = stepAfterShot(number);
      const text = stopped.page.text;
      expect(store.recording()).toBe(false);
      expect(store.swingStatus()).toBe(reworded('text.swingStatusText', text['swingStatusText']));
      expect(store.swingHelp()).toBe(reworded('text.swingHelpText', text['swingHelpText']));
      expect(store.statusText()).toBe(text['statusText']);
      expect(String(store.shotCount())).toBe(text['shotCounterDisplay']);
      expect(store.kpi().speed + 'km/h').toBe(text['valSpeed']);
      expect(store.kpi().impact + 'g').toBe(text['valImpact']);
      expect(store.kpi().control).toBe(text['valControl']);
      expect(store.kpi().follow).toBe(text['valFollow']);
      expect(store.badges().control.text).toBe(text['badgeControl']);
      expect(String(store.score().num)).toBe(text['scoreNum']);
      expect(store.score().label).toBe(text['scoreLabel']);
      expect(logLines()).toEqual(reworded('lists.log', stopped.page.lists.log));

      expect(store.speedData).toEqual(stopped.internals.speed);
      expect(store.accelData).toEqual(stopped.internals.accel);
      const shots = store.shots().map(({ timestamp, speedProfile, ...rest }) => rest);
      const expectedShots = stopped.internals.shots!.map(
        ({ timestamp, speedProfile, ...rest }) => rest,
      );
      expect(shots).toEqual(expectedShots);

      // What was written to the browser's storage, newest first.
      const stored = TestBed.inject(ShotHistoryService)
        .load()
        .map(({ timestamp, ...rest }) => rest);
      const expectedStored = stopped.internals.stored!.map(({ timestamp, ...rest }) => rest);
      expect(stored).toEqual(expectedStored);
    });
  });

  it('ends an unfinished shot without saving it when the live view is left', () => {
    store.simulateSensor('TEST BAT');
    store.startShot();
    store.processData(goldenShots[3].samples[20]);
    store.leaveLiveView();
    expect(store.recording()).toBe(false);
    expect(store.shots()).toEqual([]);
    expect(store.statusText()).toBe('COMPLETE');
    expect(store.swingStatus()).toBe('SESSION COMPLETE: 0 SHOTS RECORDED');
    expect(TestBed.inject(ShotHistoryService).load()).toEqual([]);
  });

  it('runs the demo: readings arrive by themselves while a shot is recorded', () => {
    vi.useFakeTimers();
    try {
      store.startDemoMode();
      expect(store.sensorText()).toBe('DEMO BAT');
      expect(store.statusText()).toBe('DEMO');
      store.startShot();
      vi.advanceTimersByTime(2000); // 80 readings at one every 25 ms
      expect(store.speedData.length).toBe(80);
      store.stopShot();
      expect(store.shots().length).toBe(1);
      expect(store.shots()[0].dataPoints).toBe(80);
      expect(store.shots()[0].peakSpeed).toBeGreaterThan(20);
      vi.advanceTimersByTime(1000);
      expect(store.speedData.length).toBe(80); // nothing arrives after the shot is stopped

      store.leaveLiveView();
      expect(store.sensorText()).toBe('NO SENSOR');
      expect(store.statusText()).toBe('STANDBY');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LiveSessionStore, battery level', () => {
  it('shows the level the bat reports, hides 0, and forgets it on disconnect', async () => {
    useMemoryStorage();
    let handlers!: BluetoothHandlers;
    const fake = {
      supported: true,
      connected: true,
      connect: async (h: BluetoothHandlers) => ((handlers = h), 'SwingLab-Bat'),
      disconnect: () => {},
    };
    TestBed.configureTestingModule({
      providers: [LiveSessionStore, { provide: BluetoothService, useValue: fake }],
    });
    const store = TestBed.inject(LiveSessionStore);
    try {
      await store.connectBluetooth();
      expect(store.batteryPercent()).toBeNull();
      handlers.battery(76);
      expect(store.batteryPercent()).toBe(76);
      handlers.battery(0);
      expect(store.batteryPercent()).toBeNull();
      handlers.battery(40);
      handlers.disconnected();
      expect(store.batteryPercent()).toBeNull();
    } finally {
      store.destroy();
    }
  });
});

describe('LiveSessionStore, auto record', () => {
  it('saves a swing as a shot without START, and keeps the setting', async () => {
    useMemoryStorage();
    let handlers!: BluetoothHandlers;
    const fake = {
      supported: true,
      connected: true,
      connect: async (h: BluetoothHandlers) => ((handlers = h), 'SwingLab-Bat'),
      disconnect: () => {},
    };
    TestBed.configureTestingModule({
      providers: [LiveSessionStore, { provide: BluetoothService, useValue: fake }],
    });
    const store = TestBed.inject(LiveSessionStore);
    try {
      await store.connectBluetooth();
      const reading = (gz: number) => ({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz });
      const swing = () => {
        for (let i = 0; i < 60; i++) handlers.sample(reading(0));
        for (let i = 0; i < 30; i++) handlers.sample(reading(800)); // about 43 km/h
        for (let i = 0; i < 30; i++) handlers.sample(reading(0));
      };
      swing();
      expect(store.shots().length).toBe(0); // off by default

      store.setAutoRecord(true);
      swing();
      expect(store.shots().length).toBe(1);
      expect(store.shots()[0].peakSpeed).toBeGreaterThan(40);
      expect(store.recording()).toBe(false);
      expect(localStorage.getItem('swinglab.autoRecord')).toBe('true');
    } finally {
      store.destroy();
    }
  });
});
