import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'planning-poker-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);

  private readonly _theme = signal<Theme>(this.initialTheme());

  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    effect(() => {
      const isDark = this._theme() === 'dark';
      this.document.documentElement.classList.toggle('dark-mode', isDark);
      try {
        localStorage.setItem(STORAGE_KEY, this._theme());
      } catch {}
    });
  }

  toggle(): void {
    this._theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private initialTheme(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {}
    return 'dark';
  }
}
