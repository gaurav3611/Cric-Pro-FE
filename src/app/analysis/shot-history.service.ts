import { Injectable, signal } from '@angular/core';
import { FollowGrade, Shot, ShotDirection, ShotGrade } from './swing-analysis';

/** A shot as it is kept in the browser. Old entries may have no speed profile. */
export interface StoredShot {
  number: number;
  peakSpeed: number;
  peakImpact: number;
  accuracy: number;
  controlScore: number;
  direction: ShotDirection;
  followGrade: FollowGrade;
  grade: ShotGrade;
  dataPoints: number;
  speedProfile?: number[];
  timestamp: string;
}

export interface HomeStats {
  swings: number;
  bestSpeed: number;
  offSide: number;
  legSide: number;
  /** Number of different days with a shot. The original used this as its session count. */
  sessions: number;
}

/**
 * Shot history in localStorage, newest first, at most 50 shots.
 * The key is the original site's key, so shots saved there show up here on the same address.
 */
@Injectable({ providedIn: 'root' })
export class ShotHistoryService {
  static readonly KEY = 'sswingg_shots';
  static readonly OLD_KEY = 'swinglab_shots';
  static readonly LIMIT = 50;

  /** Goes up by one with every saved shot, so a view on screen can show it at once. */
  readonly saved = signal(0);

  constructor() {
    // Shots saved before the rename to SSwinGG move to the new key once.
    try {
      const old = localStorage.getItem(ShotHistoryService.OLD_KEY);
      if (old !== null && localStorage.getItem(ShotHistoryService.KEY) === null) {
        localStorage.setItem(ShotHistoryService.KEY, old);
        localStorage.removeItem(ShotHistoryService.OLD_KEY);
      }
    } catch (error) {
      console.warn('Could not move old shot history:', error);
    }
  }

  load(): StoredShot[] {
    try {
      return JSON.parse(localStorage.getItem(ShotHistoryService.KEY) || '[]') as StoredShot[];
    } catch (error) {
      console.warn('Could not load shot history:', error);
      return [];
    }
  }

  save(shot: Shot): void {
    try {
      let history = this.load();
      history.unshift({
        number: shot.number,
        peakSpeed: +shot.peakSpeed.toFixed(1),
        peakImpact: +shot.peakImpact.toFixed(1),
        accuracy: shot.accuracy,
        controlScore: shot.controlScore,
        direction: shot.direction,
        followGrade: shot.followGrade,
        grade: shot.grade,
        dataPoints: shot.dataPoints,
        speedProfile: shot.speedProfile || [],
        timestamp: shot.timestamp.toISOString(),
      });
      if (history.length > ShotHistoryService.LIMIT)
        history = history.slice(0, ShotHistoryService.LIMIT);
      localStorage.setItem(ShotHistoryService.KEY, JSON.stringify(history));
      this.saved.update((n) => n + 1);
    } catch (error) {
      console.warn('Could not save shot:', error);
    }
  }

  clear(): void {
    localStorage.removeItem(ShotHistoryService.KEY);
  }

  /** Names a shot by its time and number, not its place in the list, which moves when one is added. */
  static key(shot: StoredShot): string {
    return shot.timestamp + '|' + shot.number;
  }

  /** Deletes the shots with these keys and returns how many went. */
  remove(keys: ReadonlySet<string>): number {
    const history = this.load();
    const kept = history.filter((shot) => !keys.has(ShotHistoryService.key(shot)));
    if (kept.length) localStorage.setItem(ShotHistoryService.KEY, JSON.stringify(kept));
    else this.clear();
    return history.length - kept.length;
  }

  /** Totals for the tiles on the home view, or null when nothing is stored. */
  stats(history: StoredShot[]): HomeStats | null {
    if (history.length === 0) return null;
    let bestSpeed = 0;
    let offSide = 0;
    let legSide = 0;
    history.forEach((s) => {
      if (s.peakSpeed > bestSpeed) bestSpeed = s.peakSpeed;
      if (s.direction === 'off') offSide++;
      else if (s.direction === 'leg') legSide++;
    });
    const days = new Set(history.map((s) => new Date(s.timestamp).toDateString()));
    return { swings: history.length, bestSpeed, offSide, legSide, sessions: days.size };
  }
}
