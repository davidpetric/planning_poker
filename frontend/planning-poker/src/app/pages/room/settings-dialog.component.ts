import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { RoomService } from '../../services/room.service';

interface Preset {
  key: string;
  label: string;
  values: string[];
}

const PRESETS: Preset[] = [
  { key: 'days', label: 'Days', values: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '?'] },
  { key: 'fibonacci', label: 'Fibonacci', values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'] },
  { key: 'modified-fibonacci', label: 'Modified Fibonacci', values: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?'] },
  { key: 't-shirt', label: 'T-shirt sizes', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?'] },
  { key: 'powers-of-two', label: 'Powers of 2', values: ['1', '2', '4', '8', '16', '32', '64', '?'] },
];
const CUSTOM_KEY = 'custom';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Room Settings</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Deck</mat-label>
        <mat-select [ngModel]="selectedKey()" (ngModelChange)="selectedKey.set($event)">
          @for (p of presets; track p.key) {
            <mat-option [value]="p.key">{{ p.label }}</mat-option>
          }
          <mat-option [value]="customKey">Custom…</mat-option>
        </mat-select>
      </mat-form-field>

      @if (selectedKey() === customKey) {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Card values (comma-separated)</mat-label>
          <input
            matInput
            [ngModel]="customInput()"
            (ngModelChange)="customInput.set($event)"
            placeholder="1, 2, 3, ?">
        </mat-form-field>
      }

      <p class="preview">Preview: {{ previewValues().join('  ·  ') || '(empty)' }}</p>
      @if (errorMessage()) {
        <p class="dialog-error">{{ errorMessage() }}</p>
      }

      <mat-slide-toggle
        class="lock-toggle"
        [checked]="hostOnlyControls()"
        (change)="hostOnlyControls.set($event.checked)">
        Only host can reveal &amp; start new voting
      </mat-slide-toggle>

      <p class="warning">Changing the deck will clear all current votes.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-raised-button color="primary" (click)="apply()" [disabled]="!isValid()">Apply</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .preview { color: #888; margin: 4px 0 8px; font-family: monospace; word-break: break-word; }
    .lock-toggle { display: block; margin: 16px 0 4px; }
    .warning { color: #b58900; margin-top: 12px; font-size: 0.9em; }
    .dialog-error { color: #f44336; margin: 8px 0 0; }
  `],
})
export class SettingsDialogComponent {
  private readonly roomService = inject(RoomService);
  readonly dialogRef = inject(MatDialogRef<SettingsDialogComponent>);
  private readonly data = inject<{ cardValues: string[]; hostOnlyControls: boolean }>(MAT_DIALOG_DATA);

  readonly presets = PRESETS;
  readonly customKey = CUSTOM_KEY;
  private readonly currentCards: string[] = this.data?.cardValues ?? [];
  readonly selectedKey = signal<string>(this.detectInitialKey());
  readonly customInput = signal<string>(this.currentCards.join(', '));
  readonly hostOnlyControls = signal<boolean>(this.data?.hostOnlyControls ?? true);

  readonly previewValues = computed<string[]>(() => {
    const key = this.selectedKey();
    if (key === CUSTOM_KEY) return this.parseCustom(this.customInput());
    return PRESETS.find(p => p.key === key)?.values ?? [];
  });

  readonly errorMessage = computed<string>(() => {
    const v = this.previewValues();
    if (v.length < 2) return 'Need at least 2 cards.';
    if (v.length > 16) return 'Maximum 16 cards.';
    if (v.some(x => x.length > 8)) return 'Each card must be 8 characters or fewer.';
    if (new Set(v).size !== v.length) return 'Duplicate values are not allowed.';
    return '';
  });

  readonly isValid = computed(() => !this.errorMessage());

  apply(): void {
    if (!this.isValid()) return;
    this.roomService.configureRoom({
      cardValues: this.previewValues(),
      hostOnlyControls: this.hostOnlyControls(),
    });
    this.dialogRef.close();
  }

  private parseCustom(raw: string): string[] {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  private detectInitialKey(): string {
    const current = this.currentCards;
    if (current.length === 0) return CUSTOM_KEY;
    const match = PRESETS.find(p =>
      p.values.length === current.length &&
      p.values.every((v, i) => v === current[i]));
    return match ? match.key : CUSTOM_KEY;
  }
}
