import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RoomService } from '../../services/room.service';

interface RenameData {
  currentName: string;
  takenNames: string[];
}

@Component({
  selector: 'app-rename-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Change your name</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Your Name</mat-label>
        <input
          matInput
          [ngModel]="newName()"
          (ngModelChange)="newName.set($event)"
          (keyup.enter)="save()"
          placeholder="Enter your name">
      </mat-form-field>
      @if (validationError()) {
        <p class="dialog-error">{{ validationError() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="save()"
        [disabled]="!isValid()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .dialog-error { color: #f44336; margin: 0; }
  `],
})
export class RenameDialogComponent {
  private readonly roomService = inject(RoomService);
  readonly dialogRef = inject(MatDialogRef<RenameDialogComponent>);
  private readonly data = inject<RenameData>(MAT_DIALOG_DATA);

  readonly newName = signal(this.data.currentName);

  readonly trimmed = computed(() => this.newName().trim());

  readonly validationError = computed<string>(() => {
    const t = this.trimmed();
    if (!t) return 'Name is required.';
    if (t.length > 30) return 'Maximum 30 characters.';
    if (t.toLowerCase() === this.data.currentName.toLowerCase()) return '';
    const lower = t.toLowerCase();
    if (this.data.takenNames.some(n => n.toLowerCase() === lower)) {
      return 'That name is already taken in this room.';
    }
    return '';
  });

  readonly isValid = computed(() =>
    !this.validationError() && this.trimmed() !== this.data.currentName);

  save(): void {
    if (!this.isValid()) return;
    this.roomService.renameSelf(this.trimmed());
    this.dialogRef.close();
  }
}
