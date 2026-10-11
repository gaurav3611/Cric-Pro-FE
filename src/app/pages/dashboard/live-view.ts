import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Chart from 'chart.js/auto';
import type { ChartOptions } from 'chart.js';
import { Icon } from '../../shared/icon';
import { BatScene } from '../../three/bat-scene';
import { LiveSessionStore } from './live-session.store';
import { ParityProbe } from './parity-probe';
import { ShotDetailService } from './shot-detail.service';

type LineChart = Chart<'line', number[], number | string>;

/** How many readings the speed chart shows at once. */
const CHART_WINDOW = 200;
/** How many readings the acceleration chart keeps. */
const ACCEL_WINDOW = 80;

/**
 * The Live view: recording controls, the four tiles, the charts, the 3D bat and the summary.
 *
 * The numbers and texts come from LiveSessionStore. This component adds what is drawn on a
 * canvas: the speed chart with its scroll buttons, the acceleration chart and the 3D bat.
 */
@Component({
  selector: 'app-live-view',
  imports: [Icon],
  templateUrl: './live-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveView implements OnDestroy {
  readonly active = input(false);
  /** The BACK button was pressed. */
  readonly back = output<void>();

  protected readonly store = inject(LiveSessionStore);
  protected readonly detail = inject(ShotDetailService);

  private readonly speedCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('speedCanvas');
  private readonly accelCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('accelCanvas');
  private readonly threeContainer = viewChild.required<ElementRef<HTMLElement>>('threeContainer');

  private speedChart: LineChart | null = null;
  private accelChart: LineChart | null = null;
  private readonly bat = new BatScene();
  private setupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // The charts and the 3D scene need a visible container to size themselves, so they are
    // created shortly after the view is shown for the first time.
    effect(() => {
      if (this.active() && !this.speedChart && !this.setupTimer) {
        this.setupTimer = setTimeout(() => {
          this.initCharts();
          this.initThree();
        }, 100);
      }
    });

    this.store.sampleProcessed.pipe(takeUntilDestroyed()).subscribe(({ sample, acc }) => {
      this.updateChartView();
      if (this.accelChart) {
        const data = this.accelChart.data;
        data.labels!.push('');
        data.datasets[0].data.push(+acc.toFixed(2));
        if (data.labels!.length > ACCEL_WINDOW) {
          data.labels!.shift();
          data.datasets[0].data.shift();
        }
        this.accelChart.update('none');
      }
      this.bat.update(sample.gy, sample.gx, sample.gz, acc);
    });

    this.store.chartsCleared.pipe(takeUntilDestroyed()).subscribe(() => {
      for (const chart of [this.speedChart, this.accelChart]) {
        if (chart) {
          chart.data.labels = [];
          chart.data.datasets[0].data = [];
          chart.update('none');
        }
      }
    });

    this.store.batReset.pipe(takeUntilDestroyed()).subscribe(() => this.bat.reset());

    const probe = inject(ParityProbe);
    probe.speedChart = () => {
      if (!this.speedChart) return null;
      const dataset = this.speedChart.data.datasets[0];
      return {
        labels: this.speedChart.data.labels!.slice(),
        data: dataset.data.slice(),
        radius: ([] as unknown[]).concat(dataset.pointRadius),
        colours: ([] as unknown[]).concat(dataset.pointBackgroundColor || []),
      };
    };
    probe.accelChart = () =>
      this.accelChart ? this.accelChart.data.datasets[0].data.slice() : null;
    probe.bat = () => this.bat.state();
  }

  // ------------------------------------------------------------------ speed chart

  /** Redraws the speed chart for the part of the session that is in view. */
  private updateChartView(): void {
    if (!this.speedChart) return;
    const speedData = this.store.speedData;
    const shots = this.store.shots();
    const total = speedData.length;

    let start: number;
    let end: number;
    if (this.store.chartViewStart === -1) {
      // Following the newest readings.
      start = Math.max(0, total - CHART_WINDOW);
      end = total;
    } else {
      start = this.store.chartViewStart;
      end = Math.min(start + CHART_WINDOW, total);
    }

    const visible = speedData.slice(start, end);
    const dataset = this.speedChart.data.datasets[0];
    this.speedChart.data.labels = visible.map((_, i) => start + i);
    dataset.data = visible;

    // An orange dot marks the fastest reading of each shot.
    const pointRadii = new Array<number>(visible.length).fill(0);
    const pointColours = new Array<string>(visible.length).fill('rgba(0,212,255,0.8)');
    shots.forEach((shot) => {
      if (shot.peakIndex >= start && shot.peakIndex < end) {
        pointRadii[shot.peakIndex - start] = 6;
        pointColours[shot.peakIndex - start] = '#ff6b00';
      }
    });
    dataset.pointRadius = pointRadii;
    dataset.pointBackgroundColor = pointColours;
    this.speedChart.update('none');

    this.store.chartNavInfo.set(
      this.store.chartViewStart === -1
        ? 'LIVE · ' + total + ' data points · ' + shots.length + ' shots'
        : 'Viewing ' +
            (start + 1) +
            ' to ' +
            end +
            ' of ' +
            total +
            ' · ' +
            shots.length +
            ' shots',
    );
  }

  protected scrollChartLeft(): void {
    const total = this.store.speedData.length;
    if (total <= CHART_WINDOW) return;
    if (this.store.chartViewStart === -1) {
      this.store.chartViewStart = Math.max(0, total - CHART_WINDOW);
    }
    this.store.chartViewStart = Math.max(
      0,
      this.store.chartViewStart - Math.floor(CHART_WINDOW / 2),
    );
    this.updateChartView();
  }

  protected scrollChartRight(): void {
    if (this.store.chartViewStart === -1) return;
    this.store.chartViewStart += Math.floor(CHART_WINDOW / 2);
    if (this.store.chartViewStart + CHART_WINDOW >= this.store.speedData.length) {
      this.store.chartViewStart = -1; // back to following the newest readings
    }
    this.updateChartView();
  }

  protected scrollChartToEnd(): void {
    this.store.chartViewStart = -1;
    this.updateChartView();
  }

  // ------------------------------------------------------------------ setup

  private initCharts(): void {
    if (this.speedChart) return;

    const defaults: ChartOptions<'line'> = {
      responsive: true,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(12,20,35,0.95)',
          titleColor: '#00d4ff',
          bodyColor: '#e0eaf5',
          borderColor: 'rgba(30,65,110,0.5)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: 'Orbitron', size: 11 },
          bodyFont: { family: 'Inter', size: 12 },
          callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y },
        },
      },
      scales: {
        x: { display: false },
        y: {
          min: 0,
          grid: { color: 'rgba(26,58,92,0.3)' },
          ticks: { color: '#4a6a8a', font: { size: 10 } },
          border: { color: 'rgba(26,58,92,0.3)' },
        },
      },
    };

    this.speedChart = new Chart(this.speedCanvas().nativeElement, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Speed (km/h)',
            data: [],
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0,212,255,0.06)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: defaults,
    });

    this.accelChart = new Chart(this.accelCanvas().nativeElement, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Accel (g)',
            data: [],
            borderColor: '#ff6b00',
            backgroundColor: 'rgba(255,107,0,0.06)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: defaults,
    });
  }

  private initThree(): void {
    if (this.bat.initialised) return;
    try {
      this.bat.init(this.threeContainer().nativeElement);
    } catch (error) {
      // Without WebGL the rest of the live view still works.
      console.warn('[3D] The bat view could not start:', error);
    }
  }

  ngOnDestroy(): void {
    if (this.setupTimer) clearTimeout(this.setupTimer);
    this.speedChart?.destroy();
    this.accelChart?.destroy();
    this.bat.dispose();
  }
}
