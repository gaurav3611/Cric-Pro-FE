/**
 * The swing arithmetic, ported from the inline script of Cricket/frontend/dashboard.html.
 *
 * Everything here is a pure function with no Angular in it. The formulas, constants and the
 * order of operations are kept exactly, because tools/parity.mjs compares the numbers this
 * app shows with the numbers the original dashboard showed.
 */

import { PALETTE } from '../shared/palette';

/** One reading from the bat. Acceleration in g, rotation in degrees per second. */
export interface SensorSample {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export type ShotDirection = 'leg' | 'off' | 'straight';
export type FollowGrade = 'STRONG' | 'DECENT' | 'WEAK';
export type ShotGrade = 'excellent' | 'good' | 'average' | 'poor';

/** The result of analysing one recorded shot. */
export interface Shot {
  number: number;
  peakSpeed: number;
  peakImpact: number;
  controlScore: number;
  accuracy: number;
  direction: ShotDirection;
  followGrade: FollowGrade;
  grade: ShotGrade;
  dataPoints: number;
  /** Speed of every reading of the shot, in km/h. */
  speedProfile: number[];
  /** Position of the shot's fastest reading in the session's speed list, for the chart marker. */
  peakIndex: number;
  timestamp: Date;
}

export interface CoachAnalysis {
  tips: string[];
  corrections: string[];
  strengths: string[];
  summary: string;
}

export interface SessionSummary {
  shots: number;
  avgSpeed: number;
  bestSpeed: number;
  avgAccuracy: number;
  overallScore: number;
  analysis: CoachAnalysis;
  /** Readings recorded in the whole session. */
  dataPoints: number;
}

export interface SwingScore {
  score: number;
  /** stroke-dashoffset of the score ring, whose circumference is 314. */
  offset: number;
  colour: string;
  label: string;
}

export interface KpiBadge {
  text: string;
  /** Extra CSS class: '' for good, 'warn' or 'danger'. */
  cls: string;
}

export interface ShotKpis {
  speed: string;
  impact: string;
  control: string;
  follow: string;
  badges: { speed: KpiBadge; impact: KpiBadge; control: KpiBadge; follow: KpiBadge };
}

/** Rotation below this many degrees per second counts as no movement. */
const ROTATION_DEAD_ZONE = 5;
/** Distance in metres from the wrists to the bat's sweet spot. */
const BAT_LENGTH_M = 0.85;
const MAX_SPEED_KMH = 180;

/** Bat speed of one reading: rotation speed turned into the speed of the sweet spot. */
export function instantSpeedKmh(s: SensorSample): number {
  let angularVelocity = Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
  if (angularVelocity < ROTATION_DEAD_ZONE) angularVelocity = 0;
  const speed = angularVelocity * (Math.PI / 180) * BAT_LENGTH_M * 3.6;
  return Math.min(speed, MAX_SPEED_KMH);
}

/** Total acceleration of one reading, in g. */
export function accelMagnitude(s: SensorSample): number {
  return Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
}

/** Light smoothing for the live display: 30% of the previous value, 70% of the new one. */
export function smoothSpeed(previous: number, current: number): number {
  return previous * 0.3 + current * 0.7;
}

export function directionOf(gz: number): ShotDirection {
  if (gz > 1) return 'leg';
  if (gz < -1) return 'off';
  return 'straight';
}

/**
 * Analyses the readings of one shot.
 *
 * @param totalSpeedPoints how many readings the session's speed list holds, this shot included
 */
export function analyzeSwing(
  data: SensorSample[],
  shotNumber: number,
  totalSpeedPoints: number,
  now = new Date(),
): Shot {
  let peakSpeed = 0;
  let peakImpact = 0;
  let lastGZ = 0;
  let peakIndex = -1;
  const gyVals: number[] = [];
  const speedsForShot: number[] = [];

  data.forEach((s, idx) => {
    const speed = instantSpeedKmh(s);
    const acc = accelMagnitude(s);
    speedsForShot.push(speed);
    if (speed > peakSpeed) {
      peakSpeed = speed;
      peakIndex = idx;
    }
    if (acc > peakImpact) peakImpact = acc;
    gyVals.push(s.gy);
    lastGZ = s.gz;
  });

  // Control: how little the rotation around y varied over the shot.
  const mean = gyVals.length ? gyVals.reduce((a, b) => a + b, 0) / gyVals.length : 0;
  const variance = gyVals.length
    ? gyVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / gyVals.length
    : 0;
  const controlScore = Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 20));

  // Accuracy: half the control score, plus points for impact and for speed.
  let accuracy = Math.round(
    controlScore * 0.5 +
      (peakImpact > 15 ? 30 : peakImpact > 8 ? 20 : 10) +
      (peakSpeed > 60 ? 20 : peakSpeed > 30 ? 15 : 5),
  );
  accuracy = Math.min(100, accuracy);

  // Direction comes from the last reading of the shot.
  const direction = directionOf(lastGZ);
  const followGrade: FollowGrade = peakImpact > 20 ? 'STRONG' : peakImpact > 12 ? 'DECENT' : 'WEAK';
  const grade: ShotGrade =
    accuracy >= 80 ? 'excellent' : accuracy >= 60 ? 'good' : accuracy >= 40 ? 'average' : 'poor';

  return {
    number: shotNumber,
    peakSpeed,
    peakImpact,
    controlScore: Math.round(controlScore),
    accuracy,
    direction,
    followGrade,
    grade,
    dataPoints: data.length,
    speedProfile: speedsForShot,
    peakIndex: totalSpeedPoints - data.length + peakIndex,
    timestamp: now,
  };
}

/**
 * The remarks under a session's numbers. They come from the fixed thresholds below, which are
 * the original's. Nothing here is learned or generated.
 *
 * Each remark names the number it is based on. The wording assumes what summariseSession
 * passes in: the best speed, the average impact, and the average accuracy as `controlScore`.
 */
export function aiCoachAnalysis(
  peakSpeed: number,
  peakImpact: number,
  controlScore: number,
  lastShotGZ: number,
): CoachAnalysis {
  const tips: string[] = [];
  const corrections: string[] = [];
  const strengths: string[] = [];

  if (peakSpeed > 80) {
    strengths.push('Best bat speed is above 80 km/h.');
    tips.push('Work on timing, so that the fastest shots are also the accurate ones.');
  } else if (peakSpeed > 60) {
    strengths.push('Best bat speed is above 60 km/h.');
    tips.push('Turn the shoulders further through the shot to add bat speed.');
  } else if (peakSpeed > 40) {
    tips.push('Best bat speed is between 40 and 60 km/h. Wrist-snap drills help to raise it.');
  } else {
    tips.push('Best bat speed is 40 km/h or less. Work on a full backlift and follow-through.');
  }

  if (peakImpact > 25) strengths.push('Average impact is above 25 g, which is firm contact.');
  else if (peakImpact > 15)
    tips.push('Average impact is between 15 and 25 g. Aim for the middle of the bat.');
  else tips.push('Average impact is 15 g or less. Play the ball later for firmer contact.');

  if (controlScore > 80) {
    strengths.push('Average accuracy is above 80%.');
  } else if (controlScore > 60) {
    strengths.push('Average accuracy is above 60%.');
    tips.push('Loosen the grip a little to steady the swing.');
  } else {
    corrections.push('Relax the grip. A tight grip makes the swing jerky.');
    corrections.push('Keep the bat straight in the backlift.');
  }

  if (lastShotGZ > 1) tips.push('The last shot went to the leg side.');
  else if (lastShotGZ < -1)
    tips.push('The last shot went to the off side. Keep the head still through the drive.');
  else tips.push('The last shot was straight.');

  const s = (peakSpeed / 100) * 40 + (peakImpact / 30) * 30 + (controlScore / 100) * 30;
  let summary: string;
  if (s > 85) summary = 'Excellent session.';
  else if (s > 70) summary = 'Strong session.';
  else if (s > 50) summary = 'Solid session. The tips above show where to improve.';
  else summary = 'Work on the basics first: grip, backlift and follow-through.';

  return { tips, corrections, strengths, summary };
}

/**
 * Sums up all shots of the session. Needs at least one shot.
 * As in the original, the coach is given the average accuracy where it expects a control score.
 */
export function summariseSession(shots: Shot[], dataPoints: number): SessionSummary {
  let avgSpeed = 0;
  let avgAccuracy = 0;
  let bestSpeed = 0;
  let totalImpact = 0;

  shots.forEach((s) => {
    avgSpeed += s.peakSpeed;
    avgAccuracy += s.accuracy;
    if (s.peakSpeed > bestSpeed) bestSpeed = s.peakSpeed;
    totalImpact += s.peakImpact;
  });
  avgSpeed /= shots.length;
  avgAccuracy /= shots.length;

  const overallScore = Math.min(100, Math.round(avgSpeed * 0.4 + avgAccuracy * 0.6));
  const last = shots[shots.length - 1];
  const analysis = aiCoachAnalysis(
    bestSpeed,
    totalImpact / shots.length,
    avgAccuracy,
    last.direction === 'leg' ? 2 : last.direction === 'off' ? -2 : 0,
  );
  return {
    shots: shots.length,
    avgSpeed,
    bestSpeed,
    avgAccuracy,
    overallScore,
    analysis,
    dataPoints,
  };
}

const SCORE_LABELS = ['NEEDS WORK', 'DEVELOPING', 'GOOD FORM', 'EXCELLENT', 'POWER HIT'];

/** The number in the score ring, from a speed and a second measure. */
export function swingScore(speed: number, metric2: number): SwingScore {
  const score = Math.min(100, Math.round(speed * 0.6 + metric2 * 0.4));
  const colour = score >= 80 ? PALETTE.green : score >= 50 ? PALETTE.accent : PALETTE.ochre;
  return {
    score,
    offset: 314 - (score / 100) * 314,
    colour,
    label: SCORE_LABELS[Math.min(4, Math.floor(score / 20))],
  };
}

/** What the four tiles above the charts show for a finished shot. */
export function kpisForShot(shot: Shot): ShotKpis {
  return {
    speed: shot.peakSpeed.toFixed(1),
    impact: shot.peakImpact.toFixed(1),
    control: String(shot.controlScore),
    follow: shot.followGrade,
    badges: {
      speed: {
        text: shot.peakSpeed > 80 ? 'POWER HIT' : shot.peakSpeed > 50 ? 'MODERATE' : 'SOFT',
        cls: shot.peakSpeed > 80 ? '' : 'warn',
      },
      impact: {
        text: shot.peakImpact > 20 ? 'HARD HIT' : 'GENTLE',
        cls: shot.peakImpact > 20 ? '' : 'warn',
      },
      control: {
        text:
          shot.controlScore >= 75 ? 'EXCELLENT' : shot.controlScore >= 50 ? 'MODERATE' : 'IMPROVE',
        cls: shot.controlScore >= 75 ? '' : shot.controlScore >= 50 ? 'warn' : 'danger',
      },
      follow: {
        text: shot.followGrade,
        cls: shot.followGrade === 'STRONG' ? '' : shot.followGrade === 'DECENT' ? 'warn' : 'danger',
      },
    },
  };
}

/** Width of an axis bar: the value as a share of the bar's full scale, capped at 100%. */
export function axisBarWidth(value: number, max: number): string {
  return Math.min((Math.abs(value) / max) * 100, 100).toFixed(1) + '%';
}
