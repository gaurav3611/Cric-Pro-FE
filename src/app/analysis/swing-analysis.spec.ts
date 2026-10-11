import { goldenShots, reworded, stepAfterShot } from '../testing/golden';
import {
  Shot,
  accelMagnitude,
  aiCoachAnalysis,
  analyzeSwing,
  axisBarWidth,
  directionOf,
  instantSpeedKmh,
  kpisForShot,
  smoothSpeed,
  summariseSession,
  swingScore,
} from './swing-analysis';

describe('swing analysis, against the recording of the original dashboard', () => {
  // Run every recorded shot through the functions the way the live session does.
  const speedData: number[] = [];
  const accelData: number[] = [];
  const shots: Shot[] = [];
  let readings = 0;
  for (const [index, recorded] of goldenShots.entries()) {
    let smoothed = 0;
    for (const sample of recorded.samples) {
      smoothed = smoothSpeed(smoothed, instantSpeedKmh(sample));
      speedData.push(+smoothed.toFixed(1));
      accelData.push(+accelMagnitude(sample).toFixed(2));
      readings++;
    }
    shots.push(analyzeSwing(recorded.samples, index + 1, speedData.length));
  }
  const last = stepAfterShot(goldenShots.length);

  it('analyses every recorded shot to the same numbers', () => {
    const expected = last.internals.shots!;
    expect(shots.length).toBe(expected.length);
    shots.forEach((shot, i) => {
      const { timestamp, speedProfile, ...rest } = shot;
      const {
        timestamp: _t,
        speedProfile: expectedProfile,
        ...expectedRest
      } = expected[i] as Record<string, unknown>;
      expect(rest, goldenShots[i].name).toEqual(expectedRest);
      expect(speedProfile.length).toBe((expectedProfile as number[]).length);
      speedProfile.forEach((v, k) => expect(v).toBeCloseTo((expectedProfile as number[])[k], 9));
      expect(timestamp instanceof Date).toBe(true);
    });
  });

  it('produces the same smoothed speed and acceleration series', () => {
    expect(speedData).toEqual(last.internals.speed);
    expect(accelData).toEqual(last.internals.accel);
  });

  it('gives each finished shot the same tiles and badges', () => {
    shots.forEach((shot, i) => {
      const step = stepAfterShot(i + 1);
      const kpis = kpisForShot(shot);
      expect(kpis.speed + 'km/h').toBe(step.page.text['valSpeed']);
      expect(kpis.impact + 'g').toBe(step.page.text['valImpact']);
      expect(kpis.control).toBe(step.page.text['valControl']);
      expect(kpis.follow).toBe(step.page.text['valFollow']);
      for (const [key, id] of [
        ['speed', 'badgeSpeed'],
        ['impact', 'badgeImpact'],
        ['control', 'badgeControl'],
        ['follow', 'badgeFollow'],
      ] as const) {
        expect(kpis.badges[key].text).toBe(step.page.text[id]);
        // The recording lists an element's classes in alphabetical order.
        expect(['kpi-badge', kpis.badges[key].cls].filter(Boolean).sort().join(' ')).toBe(
          step.page.classes[id],
        );
      }
    });
  });

  it('writes the same session summary after every shot', () => {
    let soFar = 0;
    shots.forEach((_, i) => {
      soFar += goldenShots[i].samples.length;
      // The original's card, with this app's wording of the same remarks.
      const card = reworded(
        'text.aiAnalysisCard',
        stepAfterShot(i + 1).page.text['aiAnalysisCard'],
      )!;
      const summary = summariseSession(shots.slice(0, i + 1), soFar);
      const numbers =
        `SHOTS${summary.shots}AVG SPEED${summary.avgSpeed.toFixed(1)}BEST SPEED${summary.bestSpeed.toFixed(1)}` +
        `AVG ACCURACY${summary.avgAccuracy.toFixed(0)}%SCORE${summary.overallScore}`;
      expect(card).toContain(numbers);
      for (const line of [
        ...summary.analysis.strengths,
        ...summary.analysis.tips,
        ...summary.analysis.corrections,
      ]) {
        expect(card).toContain(line);
      }
      expect(card).toContain(summary.analysis.summary);
      expect(card).toContain(
        `${summary.dataPoints} readings, ${summary.shots} ${summary.shots === 1 ? 'shot' : 'shots'}.`,
      );
      // Nothing of the old wording is left once the listed changes are applied.
      expect(card).not.toMatch(/AI COACH|[—–!]/);

      const ring = stepAfterShot(i + 1).page.style['ring'] as [string, string];
      const score = swingScore(summary.bestSpeed, summary.avgAccuracy);
      expect(String(score.score)).toBe(stepAfterShot(i + 1).page.text['scoreNum']);
      expect(score.label).toBe(stepAfterShot(i + 1).page.text['scoreLabel']);
      expect(score.offset).toBeCloseTo(parseFloat(ring[0]), 9);
    });
    expect(soFar).toBe(readings);
  });
});

describe('swing analysis, rules', () => {
  const still = { ax: 0, ay: 1, az: 0, gx: 0, gy: 0, gz: 0 };

  it('treats slow rotation as no speed and caps fast rotation', () => {
    expect(instantSpeedKmh({ ...still, gy: 4.9 })).toBe(0);
    expect(instantSpeedKmh({ ...still, gy: 5 })).toBeGreaterThan(0);
    // The original's own worked example: 1000 degrees per second is 53.4 km/h.
    expect(instantSpeedKmh({ ...still, gy: 1000 })).toBeCloseTo(53.4, 1);
    expect(instantSpeedKmh({ ...still, gx: 3000, gy: 3000, gz: 3000 })).toBe(180);
  });

  it('reads the direction from rotation around z', () => {
    expect(directionOf(1.01)).toBe('leg');
    expect(directionOf(1)).toBe('straight');
    expect(directionOf(-1)).toBe('straight');
    expect(directionOf(-1.01)).toBe('off');
  });

  it('analyses a shot with no readings the way the original did', () => {
    const shot = analyzeSwing([], 3, 120);
    expect(shot).toMatchObject({
      number: 3,
      peakSpeed: 0,
      peakImpact: 0,
      controlScore: 100,
      accuracy: 65,
      direction: 'straight',
      followGrade: 'WEAK',
      grade: 'good',
      dataPoints: 0,
      speedProfile: [],
      peakIndex: 119,
    });
  });

  it('grades the follow-through by impact', () => {
    const hit = (g: number) => analyzeSwing([{ ...still, ay: g }], 1, 1).followGrade;
    expect([hit(12), hit(12.1), hit(20), hit(20.1)]).toEqual([
      'WEAK',
      'DECENT',
      'DECENT',
      'STRONG',
    ]);
  });

  it('awards accuracy points in tiers for impact and for speed', () => {
    // One reading has a perfect control score of 100, worth 50 points. Impact then adds
    // 10, 20 or 30 points and speed adds 5, 15 or 20.
    const accuracy = (g: number, gy: number) =>
      analyzeSwing([{ ...still, ay: g, gy }], 1, 1).accuracy;
    expect([accuracy(8, 0), accuracy(8.1, 0), accuracy(15, 0), accuracy(15.1, 0)]).toEqual([
      65, 75, 75, 85,
    ]);
    // 560 and 565 degrees per second sit either side of 30 km/h, 1120 and 1125 either side of 60 km/h.
    expect([accuracy(1, 560), accuracy(1, 565), accuracy(1, 1120), accuracy(1, 1125)]).toEqual([
      65, 75, 75, 80,
    ]);
    expect(accuracy(30, 2000)).toBe(100);
  });

  it('grades a shot by its accuracy', () => {
    const grade = (g: number, gy: number) => analyzeSwing([{ ...still, ay: g, gy }], 1, 1).grade;
    expect([grade(1, 0), grade(8.1, 0), grade(15.1, 0)]).toEqual(['good', 'good', 'excellent']);
    const wobbly = analyzeSwing(
      [
        { ...still, gy: 0 },
        { ...still, gy: 400 },
      ],
      1,
      2,
    ); // control 0
    expect([wobbly.controlScore, wobbly.accuracy, wobbly.grade]).toEqual([0, 15, 'poor']);
  });

  it('picks the coach remarks by tier', () => {
    expect(aiCoachAnalysis(100, 30, 100, 2)).toEqual({
      strengths: [
        'Best bat speed is above 80 km/h.',
        'Average impact is above 25 g, which is firm contact.',
        'Average accuracy is above 80%.',
      ],
      tips: [
        'Work on timing, so that the fastest shots are also the accurate ones.',
        'The last shot went to the leg side.',
      ],
      corrections: [],
      summary: 'Excellent session.',
    });
    // 81 km/h, 26 g and 81 control add up to 82.7 points: every strength, but one tier below the top.
    expect(aiCoachAnalysis(81, 26, 81, 0).summary).toBe('Strong session.');

    // The middle tiers: 61 km/h, 16 g and 61 for control add up to 58.7 points.
    expect(aiCoachAnalysis(61, 16, 61, 0)).toEqual({
      strengths: ['Best bat speed is above 60 km/h.', 'Average accuracy is above 60%.'],
      tips: [
        'Turn the shoulders further through the shot to add bat speed.',
        'Average impact is between 15 and 25 g. Aim for the middle of the bat.',
        'Loosen the grip a little to steady the swing.',
        'The last shot was straight.',
      ],
      corrections: [],
      summary: 'Solid session. The tips above show where to improve.',
    });
    expect(aiCoachAnalysis(41, 1, 10, 0).tips[0]).toBe(
      'Best bat speed is between 40 and 60 km/h. Wrist-snap drills help to raise it.',
    );

    const weak = aiCoachAnalysis(10, 1, 10, -2);
    expect(weak.strengths).toEqual([]);
    expect(weak.tips).toEqual([
      'Best bat speed is 40 km/h or less. Work on a full backlift and follow-through.',
      'Average impact is 15 g or less. Play the ball later for firmer contact.',
      'The last shot went to the off side. Keep the head still through the drive.',
    ]);
    expect(weak.corrections).toEqual([
      'Relax the grip. A tight grip makes the swing jerky.',
      'Keep the bat straight in the backlift.',
    ]);
    expect(weak.summary).toBe('Work on the basics first: grip, backlift and follow-through.');
  });

  it('keeps each remark true at the edge of its tier', () => {
    // A remark that names a threshold must not appear on the wrong side of it.
    expect(aiCoachAnalysis(80, 25, 80, 0).strengths).toEqual([
      'Best bat speed is above 60 km/h.',
      'Average accuracy is above 60%.',
    ]);
    expect(aiCoachAnalysis(60, 15, 60, 0).strengths).toEqual([]);
    expect(aiCoachAnalysis(40, 15, 60, 0).tips.slice(0, 2)).toEqual([
      'Best bat speed is 40 km/h or less. Work on a full backlift and follow-through.',
      'Average impact is 15 g or less. Play the ball later for firmer contact.',
    ]);
  });

  it('words every remark as a plain sentence', () => {
    const remarks = new Set<string>();
    for (const speed of [10, 41, 61, 81, 200])
      for (const impact of [1, 16, 26])
        for (const control of [10, 61, 81])
          for (const gz of [-2, 0, 2]) {
            const a = aiCoachAnalysis(speed, impact, control, gz);
            [...a.strengths, ...a.tips, ...a.corrections, a.summary].forEach((r) => remarks.add(r));
          }
    expect(remarks.size).toBe(21); // every remark the function can make: 6 + 3 + 5 + 3 + 4
    for (const remark of remarks) {
      expect(remark, remark).toMatch(/^[A-Z][a-z]/); // starts like a sentence, not with a LABEL:
      expect(remark, remark).toMatch(/\.$/);
      expect(remark, remark).not.toMatch(/[!—–]|\p{Extended_Pictographic}/u);
    }
  });

  it('scores and labels the ring', () => {
    expect(swingScore(0, 0)).toEqual({
      score: 0,
      offset: 314,
      colour: '#ff6b00',
      label: 'NEEDS WORK',
    });
    expect(swingScore(100, 50)).toMatchObject({ score: 80, colour: '#00ff88', label: 'POWER HIT' });
    expect(swingScore(500, 500)).toMatchObject({ score: 100, offset: 0, label: 'POWER HIT' });
    expect(swingScore(60, 35)).toMatchObject({ score: 50, colour: '#00d4ff', label: 'GOOD FORM' });
  });

  it('sizes the axis bars', () => {
    expect(axisBarWidth(5, 10)).toBe('50.0%');
    expect(axisBarWidth(-2.5, 20)).toBe('12.5%');
    expect(axisBarWidth(900, 10)).toBe('100.0%');
  });
});
