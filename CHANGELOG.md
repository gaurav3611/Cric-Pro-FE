# Changelog

## 0.2.0, 2026-10-21

- Auto record: an AUTO RECORD switch in the Live view saves each swing as a shot without START and STOP. A swing goes through the same START and STOP path, so shot cards, charts, the score ring and the session summary are unchanged. The rules are in `src/app/analysis/swing-detector.ts`, the same as the phone app's.
- The bat's battery percent next to its name in the header, from the standard Bluetooth battery value, with a BATTERY switch to hide it.
- The light "Ground" look: warm ivory, forest green, Source Serif 4 for titles and figures, crease lines under the header, the ground drawn with its 30-yard circle and pitch. The colours keep their meanings and are listed in `src/app/shared/palette.ts`.
- The parity check also compares chart colours through `tools/golden/copy-changes.json`, where each colour of the original is mapped to its replacement.

## 0.1.0, 2026-10-12

- First version: the Angular rewrite of the CricPro dashboard and login page, checked against a recording of the original.
