import { Injectable, signal } from '@angular/core';
import { FollowGrade, ShotDirection, ShotGrade } from '../../analysis/swing-analysis';

/** What the detail window needs to know about a shot, whether it was just recorded or loaded from storage. */
export interface DetailShot {
  number: number;
  peakSpeed: number;
  peakImpact: number;
  accuracy: number;
  controlScore: number;
  direction: ShotDirection;
  followGrade: FollowGrade;
  grade: ShotGrade;
  dataPoints: number;
  speedProfile: number[];
  timestamp: Date;
}

/** Opens and closes the shot detail window. Shared by the home view and the live view. */
@Injectable()
export class ShotDetailService {
  /** The shot last opened. It stays after closing, as the original window kept its content. */
  readonly shot = signal<DetailShot | null>(null);
  readonly visible = signal(false);

  open(shot: DetailShot): void {
    this.shot.set(shot);
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }
}
