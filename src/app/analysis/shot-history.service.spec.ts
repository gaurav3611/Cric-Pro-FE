import { useMemoryStorage } from '../testing/memory-storage';
import { ShotHistoryService } from './shot-history.service';
import { Shot } from './swing-analysis';

const shot = (number: number, overrides: Partial<Shot> = {}): Shot => ({
  number,
  peakSpeed: 50.049,
  peakImpact: 8.04,
  controlScore: 10,
  accuracy: 35,
  direction: 'straight',
  followGrade: 'WEAK',
  grade: 'poor',
  dataPoints: 3,
  speedProfile: [1, 50.049, 2],
  peakIndex: 1,
  timestamp: new Date('2026-10-10T10:00:00Z'),
  ...overrides,
});

describe('ShotHistoryService', () => {
  let history: ShotHistoryService;
  beforeEach(() => {
    useMemoryStorage();
    history = new ShotHistoryService();
  });

  it('starts empty and survives unreadable storage', () => {
    expect(history.load()).toEqual([]);
    localStorage.setItem('swinglab_shots', '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(history.load()).toEqual([]);
    warn.mockRestore();
  });

  it('stores shots newest first, rounded to one decimal, under the original key', () => {
    history.save(shot(1));
    history.save(shot(2, { peakSpeed: 107.029, direction: 'leg' }));
    const stored = JSON.parse(localStorage.getItem('swinglab_shots')!);
    expect(stored.map((s: { number: number }) => s.number)).toEqual([2, 1]);
    expect(stored[0]).toEqual({
      number: 2,
      peakSpeed: 107,
      peakImpact: 8,
      accuracy: 35,
      controlScore: 10,
      direction: 'leg',
      followGrade: 'WEAK',
      grade: 'poor',
      dataPoints: 3,
      speedProfile: [1, 50.049, 2],
      timestamp: '2026-10-10T10:00:00.000Z',
    });
  });

  it('keeps the newest 50 shots', () => {
    for (let i = 1; i <= 53; i++) history.save(shot(i));
    const stored = history.load();
    expect(stored.length).toBe(50);
    expect(stored[0].number).toBe(53);
    expect(stored[49].number).toBe(4);
  });

  it('adds up the totals for the home view', () => {
    expect(history.stats([])).toBeNull();
    history.save(shot(1, { direction: 'off', peakSpeed: 30 }));
    history.save(
      shot(2, { direction: 'leg', peakSpeed: 80.26, timestamp: new Date('2026-10-12T10:00:00Z') }),
    );
    history.save(shot(3, { direction: 'off', peakSpeed: 10 }));
    expect(history.stats(history.load())).toEqual({
      swings: 3,
      bestSpeed: 80.3,
      offSide: 2,
      legSide: 1,
      sessions: 2,
    });
  });

  it('clears everything', () => {
    history.save(shot(1));
    history.clear();
    expect(history.load()).toEqual([]);
  });
});
