import copy from '../../../tools/golden/copy-changes.json';
import recording from '../../../tools/golden/original-dashboard.json';
import { SensorSample } from '../analysis/swing-analysis';

/**
 * The recording of the original dashboard, made by `node tools/parity.mjs record`.
 * It holds the readings that were fed in and everything the original page then showed.
 * The unit tests check this app's logic against it without opening a browser.
 */
export interface GoldenStep {
  name: string;
  page: {
    text: Record<string, string | null>;
    classes: Record<string, string | null>;
    style: Record<string, unknown>;
    lists: { log: string[]; shots: string[] };
  };
  internals: {
    shots?: Record<string, unknown>[];
    speed?: number[];
    accel?: number[];
    stored?: Record<string, unknown>[];
  };
}

export const goldenShots = recording.shots as { name: string; samples: SensorSample[] }[];
export const goldenSteps = recording.steps as unknown as GoldenStep[];

/**
 * What this app should show where the original showed `value`.
 *
 * It is the same text with the deliberate wording changes of tools/golden/copy-changes.json
 * applied, so the numbers inside it are still the original's. `where` names the probe, for
 * example 'text.swingStatusText' or 'lists.log'. tools/parity.mjs does the same in a browser.
 */
export function reworded(where: string, value: string | null): string | null;
export function reworded(where: string, value: string[]): string[];
export function reworded(where: string, value: string | null | string[]): string | null | string[] {
  if (Array.isArray(value)) return value.map((item) => reworded(where, item) as string);
  if (value === null) return null;
  return copy.changes
    .filter((change) => change.where === where)
    .reduce((text, change) => text.split(change.from).join(change.to), value);
}

/** The step taken right after the given shot was stopped and saved. Shots count from 1. */
export function stepAfterShot(shotNumber: number): GoldenStep {
  const step = goldenSteps.find((s) => s.name === `shot ${shotNumber}: stopped and saved`);
  if (!step) throw new Error('The recording has no step for shot ' + shotNumber);
  return step;
}
