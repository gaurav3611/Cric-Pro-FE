import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import Chart from 'chart.js/auto';
import { Icon } from '../../shared/icon';
import { ParityProbe } from './parity-probe';
import { DetailShot, ShotDetailService } from './shot-detail.service';
import { PALETTE, withAlpha } from '../../shared/palette';

/** The window with one shot's numbers and its speed curve. */
@Component({
  selector: 'app-shot-detail',
  imports: [Icon],
  templateUrl: './shot-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShotDetail implements OnDestroy {
  protected readonly detail = inject(ShotDetailService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart<'line', number[], number> | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;

  protected readonly title = computed(() => {
    const shot = this.detail.shot();
    return shot ? 'Shot #' + shot.number + ' Analysis' : 'Shot #1';
  });

  protected readonly sub = computed(() => {
    const shot = this.detail.shot();
    return shot
      ? shot.direction.toUpperCase() +
          ' · ' +
          shot.timestamp.toLocaleTimeString() +
          ' · ' +
          shot.dataPoints +
          ' data points'
      : 'Details for this swing';
  });

  /** Shots saved by older versions have no speed curve to draw. */
  protected readonly noData = computed(() => {
    const shot = this.detail.shot();
    return !!shot && shot.speedProfile.length === 0;
  });

  constructor() {
    inject(ParityProbe).detailChart = () =>
      this.chart
        ? {
            data: this.chart.data.datasets[0].data.slice(),
            radius: ([] as number[]).concat(this.chart.data.datasets[0].pointRadius as number[]),
          }
        : null;

    // Draw the curve each time a shot is opened. The drawing waits a moment so that the
    // canvas is visible again when the shot before had no curve.
    effect(() => {
      const shot = this.detail.shot();
      untracked(() => {
        if (this.pending) clearTimeout(this.pending);
        this.chart?.destroy();
        this.chart = null;
        if (shot && shot.speedProfile.length > 0) {
          this.pending = setTimeout(() => this.draw(shot), 0);
        }
      });
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.detail.close();
  }

  private draw(shot: DetailShot): void {
    const profile = shot.speedProfile;
    const peakIdx = profile.indexOf(Math.max(...profile));
    const pointColours = profile.map((_, i) => (i === peakIdx ? PALETTE.ochre : 'transparent'));

    this.chart = new Chart(this.canvas().nativeElement, {
      type: 'line',
      data: {
        labels: profile.map((_, i) => i),
        datasets: [
          {
            label: 'Speed (km/h)',
            data: profile.map((s) => +(typeof s === 'number' ? s : 0).toFixed(1)),
            borderColor: PALETTE.accent,
            backgroundColor: withAlpha(PALETTE.accent, 0.08),
            borderWidth: 2,
            pointRadius: profile.map((_, i) => (i === peakIdx ? 8 : 0)),
            pointBackgroundColor: pointColours,
            pointBorderColor: pointColours,
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: PALETTE.surface,
            titleColor: PALETTE.accent,
            bodyColor: PALETTE.ink,
            borderColor: PALETTE.border,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            grid: { color: withAlpha(PALETTE.ink, 0.07) },
            ticks: { color: PALETTE.muted },
            border: { color: PALETTE.border },
          },
        },
      },
    });
  }

  ngOnDestroy(): void {
    if (this.pending) clearTimeout(this.pending);
    this.chart?.destroy();
  }
}
