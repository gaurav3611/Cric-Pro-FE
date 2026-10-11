import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ShotHistoryService } from '../../analysis/shot-history.service';
import { SensorSample } from '../../analysis/swing-analysis';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';
import { HomeView } from './home-view';
import { LiveSessionStore } from './live-session.store';
import { LiveView } from './live-view';
import { ParityProbe } from './parity-probe';
import { ShotDetail } from './shot-detail';
import { ShotDetailService } from './shot-detail.service';

type DashboardView = 'home' | 'live';

/**
 * The dashboard: a header and two views, Home and Live.
 *
 * Both views stay on the page and only one is shown, as in the original. That is why a
 * session, its charts and the 3D bat survive a visit to the Home view.
 *
 * The stylesheet is not scoped to this component (ViewEncapsulation.None) because it styles
 * body and :root. Angular removes it again when the dashboard is left.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [HomeView, Icon, LiveView, ShotDetail],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LiveSessionStore, ShotDetailService, ParityProbe],
})
export class DashboardPage implements OnDestroy {
  /** The :view part of the address. */
  readonly view = input<string>();

  protected readonly auth = inject(AuthService);
  protected readonly store = inject(LiveSessionStore);
  private readonly router = inject(Router);
  private readonly probe = inject(ParityProbe);
  private readonly history = inject(ShotHistoryService);
  private readonly home = viewChild.required(HomeView);

  protected readonly activeView = computed<DashboardView>(() =>
    this.view() === 'live' ? 'live' : 'home',
  );
  protected readonly avatar = computed(() => this.auth.displayName().charAt(0).toUpperCase());

  constructor() {
    this.store.viewRequested.pipe(takeUntilDestroyed()).subscribe((view) => this.show(view));

    // Signed out, here or in another tab: back to the login page.
    effect(() => {
      if (!this.auth.user()) void this.router.navigate(['/login']);
    });

    if (environment.testHooks) this.installTestHooks();
  }

  protected show(view: DashboardView): void {
    void this.router.navigate(['/dashboard', view]);
  }

  /** The BACK button of the live view. Unlike the Home button in the header, it reloads the Home view's data. */
  protected goBackHome(): void {
    this.store.leaveLiveView();
    this.home().refresh();
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.store.destroy();
    if (environment.testHooks)
      delete (window as unknown as Record<string, unknown>)['swinglabTest'];
  }

  /** Lets tools/parity.mjs feed readings and read state. Only in builds with testHooks on. */
  private installTestHooks(): void {
    (window as unknown as Record<string, unknown>)['swinglabTest'] = {
      simulateSensor: (name: string) => this.store.simulateSensor(name),
      feed: (samples: SensorSample[]) =>
        samples.forEach((sample) => this.store.processData(sample)),
      internals: () => ({
        shots: this.store.shots().map((shot) => ({ ...shot, timestamp: null })),
        speed: this.store.speedData.slice(),
        accel: this.store.accelData.slice(),
        chart: this.probe.speedChart ? this.probe.speedChart() : null,
        accelChart: this.probe.accelChart ? this.probe.accelChart() : null,
        detailChart: this.probe.detailChart ? this.probe.detailChart() : null,
        bat: this.probe.bat ? this.probe.bat() : { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 },
        stored: this.history.load().map((shot) => ({ ...shot, timestamp: null })),
      }),
    };
  }
}
