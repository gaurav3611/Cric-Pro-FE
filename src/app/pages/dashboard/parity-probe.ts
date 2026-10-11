import { Injectable } from '@angular/core';

/**
 * A place where the canvas-drawing components leave ways to read their state, for
 * tools/parity.mjs. It does nothing unless the build has environment.testHooks switched on.
 */
@Injectable()
export class ParityProbe {
  speedChart: (() => unknown) | null = null;
  accelChart: (() => unknown) | null = null;
  detailChart: (() => unknown) | null = null;
  bat: (() => unknown) | null = null;
}
