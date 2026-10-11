import { Injectable } from '@angular/core';
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
  static readonly KEY = 'swinglab_shots';
  static readonly LIMIT = 50;

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
    } catch (error) {
      console.warn('Could not save shot:', error);
    }
  }

  clear(): void {
    localStorage.removeItem(ShotHistoryService.KEY);
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
