import { Injectable, signal } from '@angular/core';
import { IconName } from '../shared/icon-data';

export type ToastType = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** The login page shows an icon before the text. The dashboard does not. */
  icon: IconName | null;
}

const ICONS: Record<ToastType, IconName> = {
  success: 'circle-check',
  error: 'circle-x',
  info: 'info',
};
const VISIBLE_MS = 4000;

/** Short messages that appear in a corner and disappear after four seconds. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly list = signal<Toast[]>([]);
  readonly toasts = this.list.asReadonly();

  show(message: string, type: ToastType = 'info', withIcon = false): void {
    const toast: Toast = { id: ++this.nextId, message, type, icon: withIcon ? ICONS[type] : null };
    this.list.update((all) => [...all, toast]);
    setTimeout(() => this.list.update((all) => all.filter((t) => t.id !== toast.id)), VISIBLE_MS);
  }
}
