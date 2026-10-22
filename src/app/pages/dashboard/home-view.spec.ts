import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShotHistoryService } from '../../analysis/shot-history.service';
import { Shot } from '../../analysis/swing-analysis';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { useMemoryStorage } from '../../testing/memory-storage';
import { HomeView } from './home-view';
import { LiveSessionStore } from './live-session.store';
import { ShotDetailService } from './shot-detail.service';

const shot = (number: number): Shot =>
  ({
    number,
    peakSpeed: 80 + number,
    peakImpact: 3,
    accuracy: 60,
    controlScore: 0,
    direction: 'off',
    followGrade: 'GOOD',
    grade: 'good',
    dataPoints: 40,
    speedProfile: [],
    timestamp: new Date('2026-10-22T10:00:00Z'),
  }) as unknown as Shot;

describe('HomeView', () => {
  let history: ShotHistoryService;

  beforeEach(() => {
    useMemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        LiveSessionStore,
        ShotDetailService,
        { provide: AuthService, useValue: { displayName: signal('Demo') } },
        {
          provide: ApiService,
          useValue: {
            getProfile: async () => ({ stats: {} }),
            getSessions: async () => ({ sessions: [] }),
          },
        },
      ],
    });
    history = TestBed.inject(ShotHistoryService);
  });

  const mount = (active: boolean) => {
    const fixture = TestBed.createComponent(HomeView);
    fixture.componentRef.setInput('active', active);
    fixture.detectChanges();
    const text = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector('#' + id)!.textContent!.trim();
    return { fixture, text };
  };

  it('shows a shot saved while it is on screen, at once', () => {
    const { fixture, text } = mount(true);
    history.save(shot(1));
    fixture.detectChanges();
    expect(text('homeShotCount')).toBe('1 shot');
    expect(text('statSwings')).toBe('1');
  });

  describe('deleting shots', () => {
    const setup = () => {
      [1, 2, 3, 4].forEach((n) =>
        history.save({ ...shot(n), timestamp: new Date(Date.UTC(2026, 9, 22, 10, n)) } as Shot),
      );
      const { fixture, text } = mount(true);
      const el = fixture.nativeElement as HTMLElement;
      const click = (selector: string) => {
        (el.querySelector(selector) as HTMLElement).click();
        fixture.detectChanges();
      };
      const visible = (id: string) =>
        el.querySelector('#' + id)!.classList.contains('visible') ||
        (el.querySelector('#' + id) as HTMLElement).style.display === 'flex';
      return { el, click, text, visible };
    };

    it('warns first, and Cancel keeps every shot', () => {
      const { click, text, visible } = setup();
      click('#clearShotsBtn');
      expect(visible('clearOverlay')).toBe(true);
      expect(text('clearText')).toContain('cannot be recovered');
      expect(text('clearAllBtn')).toBe('Delete all 4 shots');
      click('#clearCancelBtn');
      expect(visible('clearOverlay')).toBe(false);
      expect(history.load().length).toBe(4);
    });

    it('deletes every shot with Delete all', () => {
      const { click } = setup();
      click('#clearShotsBtn');
      click('#clearAllBtn');
      expect(history.load()).toEqual([]);
    });

    it('deletes only the chosen shots', () => {
      const { el, click, text, visible } = setup();
      const deleteButton = () => el.querySelector('#deleteSelectedBtn') as HTMLButtonElement;
      click('#clearShotsBtn');
      click('#clearChooseBtn');
      expect(visible('selectBar')).toBe(true);
      expect(deleteButton().disabled).toBe(true);
      click('#homeShotsGrid .shot-card:nth-child(1)');
      expect(deleteButton().disabled).toBe(false);
      click('#homeShotsGrid .shot-card:nth-child(3)');
      expect(text('selectCount')).toBe('2 selected');
      click('#deleteSelectedBtn');
      expect(history.load().map((s) => s.number)).toEqual([3, 1]);
      expect(text('homeShotCount')).toBe('2 shots');
      expect(visible('selectBar')).toBe(false);
    });

    it('opens a shot again once choosing is cancelled', () => {
      const { click, text } = setup();
      click('#clearShotsBtn');
      click('#clearChooseBtn');
      click('#homeShotsGrid .shot-card:nth-child(2)');
      click('#cancelSelectBtn');
      expect(text('selectCount')).toBe('0 selected');
      expect(history.load().length).toBe(4);
    });
  });

  it('shows shots saved while it was hidden as soon as it is shown again', () => {
    const { fixture, text } = mount(true);
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    history.save(shot(1));
    history.save(shot(2));
    fixture.detectChanges();
    expect(text('statSwings')).toBe('0');

    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    expect(text('homeShotCount')).toBe('2 shots');
    expect(text('statSwings')).toBe('2');
  });
});
