import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ShotHistoryService, StoredShot } from '../../analysis/shot-history.service';
import { ApiService, SessionRecord } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { LiveSessionStore } from './live-session.store';
import { ShotDetailService } from './shot-detail.service';

/** One line of the session list, ready to print. */
interface SessionLine {
  id: string;
  line: string;
  speed: string;
  score: number;
  scoreStyle: string;
}

/**
 * The Home view: totals, recent shots kept in the browser, and sessions from the API.
 *
 * Its data is loaded each time it is shown, by any button, and when a shot is saved while it
 * is on screen. Several details copy the original exactly, including that a tile or a list
 * keeps its last content when there is nothing new to put in it.
 */
@Component({
  selector: 'app-home-view',
  imports: [Icon],
  templateUrl: './home-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeView {
  readonly active = input(false);

  protected readonly auth = inject(AuthService);
  protected readonly store = inject(LiveSessionStore);
  private readonly api = inject(ApiService);
  private readonly history = inject(ShotHistoryService);
  private readonly detail = inject(ShotDetailService);
  private readonly toast = inject(ToastService);

  protected readonly stats = signal({
    sessions: '0',
    bestSpeed: '0',
    offSide: '0',
    legSide: '0',
    swings: '0',
  });

  protected readonly homeShots = signal<StoredShot[]>([]);
  protected readonly homeShotsVisible = signal(false);
  protected readonly homeShotCount = signal('0 shots');

  protected readonly sessions = signal<SessionLine[]>([]);
  protected readonly sessionsState = signal<'loading' | 'list' | 'empty'>('loading');
  protected readonly sessionCount = signal('0 sessions');

  constructor() {
    // Whenever Home is on screen, and again for each shot saved while it is (auto record keeps
    // running with the bat connected), so every saved shot shows up here.
    effect(() => {
      this.history.saved();
      if (this.active()) untracked(() => this.refresh());
    });
  }

  /** Loads the totals, the session list and the recent shots again. */
  refresh(): void {
    void this.loadUserStats();
    void this.loadSessionHistory();
    this.loadHomeShotHistory();
  }

  /** Totals come from the shots kept in the browser first. The API's numbers replace them when it has any. */
  private async loadUserStats(): Promise<void> {
    const local = this.history.stats(this.history.load());
    if (local) {
      this.stats.set({
        swings: String(local.swings),
        bestSpeed: local.bestSpeed.toFixed(1),
        offSide: String(local.offSide),
        legSide: String(local.legSide),
        sessions: String(local.sessions),
      });
    }

    try {
      const data = await this.api.getProfile();
      const remote = data.stats;
      if (remote && (remote.total_sessions ?? 0) > 0) {
        this.stats.update((current) => ({
          sessions: String(remote.total_sessions || 0),
          // As in the original, the "Best Speed" tile shows the API's average speed.
          bestSpeed: remote.avg_speed ? String(remote.avg_speed) : current.bestSpeed,
          offSide: remote.off_side_shots ? String(remote.off_side_shots) : current.offSide,
          legSide: remote.leg_side_shots ? String(remote.leg_side_shots) : current.legSide,
          swings: remote.total_swings ? String(remote.total_swings) : current.swings,
        }));
      }
    } catch {
      console.warn('[Stats] API unavailable, using local data');
    }
  }

  private async loadSessionHistory(): Promise<void> {
    this.sessionsState.set('loading');
    try {
      const data = await this.api.getSessions();
      const records = data.sessions || [];
      this.sessionCount.set(records.length + ' session' + (records.length !== 1 ? 's' : ''));
      if (records.length === 0) {
        this.sessionsState.set('empty');
        return;
      }
      this.sessions.set(records.map((record) => this.toLine(record)));
      this.sessionsState.set('list');
    } catch (error) {
      console.warn('[Sessions] Could not load:', error);
      this.sessionsState.set('empty');
    }
  }

  private toLine(s: SessionRecord): SessionLine {
    const date = s.started_at ? new Date(s.started_at) : new Date();
    const dateText = date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timeText = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const duration = s.duration_seconds ? Math.round(s.duration_seconds / 60) + ' min' : '--';
    const score = s.overall_score || 0;
    return {
      id: (s.session_id || '').substring(0, 6),
      line:
        dateText + ' at ' + timeText + ' · ' + duration + ' · ' + (s.swing_count || 0) + ' swings',
      speed: (s.peak_speed_kmh || 0).toFixed(1),
      score,
      scoreStyle:
        score >= 70
          ? 'color:var(--green)'
          : score >= 40
            ? 'color:var(--accent)'
            : 'color:var(--accent2)',
    };
  }

  private loadHomeShotHistory(): void {
    const history = this.history.load();
    if (history.length === 0) {
      this.homeShotsVisible.set(false);
      return;
    }
    this.homeShotsVisible.set(true);
    this.homeShotCount.set(history.length + ' shot' + (history.length !== 1 ? 's' : ''));
    this.homeShots.set(history);
  }

  protected timeLabel(shot: StoredShot): string {
    const time = new Date(shot.timestamp);
    return (
      time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
      ' ' +
      time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    );
  }

  /** A click on a card opens it, or picks it while shots are being chosen for deletion. */
  protected onShotClick(shot: StoredShot): void {
    if (this.selecting()) this.toggleShot(shot);
    else this.openShot(shot);
  }

  private openShot(shot: StoredShot): void {
    this.detail.open({
      ...shot,
      timestamp: new Date(shot.timestamp),
      speedProfile: shot.speedProfile || [],
    });
  }

  // ---- deleting shots: a warning first, then all of them or the chosen ones ----

  protected readonly clearOpen = signal(false);
  protected readonly clearShots = signal('');
  protected readonly clearText = signal('Deleted shots cannot be recovered.');
  protected readonly selecting = signal(false);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  protected isSelected(shot: StoredShot): boolean {
    return this.selected().has(ShotHistoryService.key(shot));
  }

  protected clearShotHistory(): void {
    const n = this.history.load().length;
    this.clearShots.set(n + ' shot' + (n !== 1 ? 's' : ''));
    this.clearText.set(
      'Deleted shots cannot be recovered. Delete all ' +
        this.clearShots() +
        ', or choose the ones to delete.',
    );
    this.clearOpen.set(true);
  }

  protected closeClear(): void {
    this.clearOpen.set(false);
  }

  protected onClearBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeClear();
  }

  protected deleteAll(): void {
    this.closeClear();
    this.stopChoosing();
    this.history.clear();
    this.homeShotsVisible.set(false);
    this.homeShots.set([]);
    this.toast.show('Shot history cleared', 'info');
  }

  protected startChoosing(): void {
    this.closeClear();
    this.selected.set(new Set());
    this.selecting.set(true);
  }

  protected stopChoosing(): void {
    this.selecting.set(false);
    this.selected.set(new Set());
  }

  private toggleShot(shot: StoredShot): void {
    const key = ShotHistoryService.key(shot);
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selected.set(next);
  }

  protected deleteSelected(): void {
    const n = this.history.remove(this.selected());
    this.stopChoosing();
    this.loadHomeShotHistory();
    this.toast.show(n + ' shot' + (n !== 1 ? 's' : '') + ' deleted', 'info');
  }
}
