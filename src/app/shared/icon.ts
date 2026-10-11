import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import { ICONS, IconName, IconShape } from './icon-data';

/**
 * One line icon, drawn as inline SVG.
 *
 * It takes the colour of the text around it and is as tall as that text, so it is sized with
 * font-size. It is decoration only and hidden from screen readers: the words beside it say
 * what it means, and a button that holds nothing but an icon needs an aria-label.
 *
 * The shapes are in icon-data.ts, which tools/icons.mjs generates.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Not scoped, like the page stylesheets, so that those can colour and size icons too.
  encapsulation: ViewEncapsulation.None,
  host: { 'aria-hidden': 'true' },
  styles: `
    app-icon {
      display: inline-flex;
      flex: none;
      line-height: 0;
      vertical-align: -0.125em;
    }
    app-icon svg {
      width: 1em;
      height: 1em;
    }
  `,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [attr.data-icon]="name()"
    >
      @for (shape of shapes(); track $index) {
        @switch (shape.tag) {
          @case ('path') {
            <svg:path [attr.d]="shape.d" />
          }
          @case ('circle') {
            <svg:circle [attr.cx]="shape.cx" [attr.cy]="shape.cy" [attr.r]="shape.r" />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="shape.x"
              [attr.y]="shape.y"
              [attr.width]="shape.width"
              [attr.height]="shape.height"
              [attr.rx]="shape.rx"
            />
          }
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly shapes = computed<IconShape[]>(() => ICONS[this.name()]);
}
