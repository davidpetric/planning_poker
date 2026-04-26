import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { Room } from '../../models/room.model';
import { RoomService } from '../../services/room.service';

@Component({
  selector: 'app-join-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Join Room</h2>
    <mat-dialog-content>
      <p>Enter your name to join this planning poker session.</p>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Your Name</mat-label>
        <input
          matInput
          [(ngModel)]="playerName"
          placeholder="Enter your name"
          (keyup.enter)="join()"
          (input)="errorMessage.set('')">
        <mat-icon matPrefix>person</mat-icon>
      </mat-form-field>
      @if (errorMessage()) {
        <p class="dialog-error">{{ errorMessage() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(null)" [disabled]="busy()">Cancel</button>
      <button mat-raised-button color="primary" (click)="join()"
              [disabled]="!playerName.trim() || busy()">
        Join
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    p { margin-bottom: 16px; color: #666; }
    .dialog-error { color: #f44336; margin-top: 8px; margin-bottom: 0; }
  `],
})
export class JoinDialogComponent {
  private readonly roomService = inject(RoomService);
  readonly dialogRef = inject<MatDialogRef<JoinDialogComponent, Room | null>>(MatDialogRef);
  private readonly data = inject<{
    roomId: string;
    initialName?: string;
    initialError?: string;
  }>(MAT_DIALOG_DATA);

  playerName = this.data.initialName ?? '';
  readonly errorMessage = signal(this.data.initialError ?? '');
  readonly busy = signal(false);

  async join(): Promise<void> {
    const name = this.playerName.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    const result = await this.roomService.joinRoom(this.data.roomId, name);
    this.busy.set(false);
    if ('room' in result) {
      this.dialogRef.close(result.room);
    } else {
      this.errorMessage.set(result.error);
    }
  }
}
