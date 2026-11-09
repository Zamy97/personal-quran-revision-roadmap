import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'quran-mushaf-popup';

/**
 * Global preference: whether the mushaf overlay should open by itself
 * while listening or memorizing. Explicit Mushaf buttons still work.
 * Defaults to off.
 */
@Injectable({ providedIn: 'root' })
export class MushafSettingsService {
  readonly popupEnabled = signal(this.readStored());

  toggle(): void {
    const next = !this.popupEnabled();
    this.popupEnabled.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* private mode / quota */
    }
  }

  private readStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      return false;
    }
  }
}
