import { SensorSample, instantSpeedKmh } from './swing-analysis';

// Counted in readings. The bat sends 50 a second, so 50 readings are one second.
const PRE_ROLL = 50; // kept from before the start, so the backlift is in the shot
const START_KMH = 10;
const STOP_KMH = 5;
const QUIET_READINGS = 25; // this long below STOP_KMH ends the swing
const MAX_READINGS = 150; // a swing is cut after 3 seconds
const MIN_PEAK_KMH = 12; // slower movements are waggles, not shots
const MIN_MOVING_READINGS = 15; // shorter than 0.3 s is a knock, not a shot
const COOLDOWN_READINGS = 50; // the bat settling after the follow-through is not a new shot

/**
 * Finds swings in the stream of readings, so shots can be recorded without START and STOP.
 * The same rules are in the phone app, in lib/analysis.dart.
 */
export class SwingDetector {
  private before: SensorSample[] = [];
  private swing: SensorSample[] | null = null;
  private moving = 0;
  private quiet = 0;
  private peak = 0;
  private cooldown = 0;

  /** Takes one reading. Returns the readings of a finished swing, or null. */
  push(sample: SensorSample): SensorSample[] | null {
    const speed = instantSpeedKmh(sample);
    if (!this.swing) {
      if (this.cooldown > 0) {
        this.cooldown--;
        return null;
      }
      this.before.push(sample);
      if (this.before.length > PRE_ROLL) this.before.shift();
      if (speed > START_KMH) {
        this.swing = this.before;
        this.before = [];
        this.moving = 1;
        this.quiet = 0;
        this.peak = speed;
      }
      return null;
    }

    this.swing.push(sample);
    this.moving++;
    this.peak = Math.max(this.peak, speed);
    this.quiet = speed < STOP_KMH ? this.quiet + 1 : 0;
    if (this.quiet < QUIET_READINGS && this.moving < MAX_READINGS) return null;

    const swing = this.swing;
    const keep = this.peak >= MIN_PEAK_KMH && this.moving - this.quiet >= MIN_MOVING_READINGS;
    this.swing = null;
    this.cooldown = COOLDOWN_READINGS;
    return keep ? swing : null;
  }

  /** Forgets a swing in progress, for example when the sensor disconnects. */
  reset(): void {
    this.before = [];
    this.swing = null;
    this.cooldown = 0;
  }
}
