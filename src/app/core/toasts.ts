import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '../shared/icon';
import { ToastService } from './toast.service';

/** Draws the toasts. The colours come from the stylesheet of whichever page is showing. */
@Component({
  selector: 'app-toasts',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container" role="status" aria-live="polite">
      @for (toast of service.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}">
          @if (toast.icon; as icon) {
            <app-icon [name]="icon" />
          }
          <span>{{ toast.message }}</span>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly service = inject(ToastService);
}
