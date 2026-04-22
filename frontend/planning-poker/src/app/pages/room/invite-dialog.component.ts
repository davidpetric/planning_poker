import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-invite-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Invite Players</h2>
    <mat-dialog-content>
      <p>Share this link or Room ID with your team:</p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Room Link</mat-label>
        <input matInput [value]="inviteLink" readonly>
        <button mat-icon-button matSuffix (click)="copyLink()" matTooltip="Copy link">
          <mat-icon>content_copy</mat-icon>
        </button>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Room ID</mat-label>
        <input matInput [value]="data.roomId" readonly>
        <button mat-icon-button matSuffix (click)="copyId()" matTooltip="Copy ID">
          <mat-icon>content_copy</mat-icon>
        </button>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    p { margin-bottom: 16px; color: #666; }
  `],
})
export class InviteDialogComponent {
  inviteLink: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { roomId: string },
    private dialogRef: MatDialogRef<InviteDialogComponent>,
    private snackBar: MatSnackBar,
  ) {
    this.inviteLink = `${window.location.origin}/room/${data.roomId}`;
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.inviteLink);
    this.snackBar.open('Link copied!', 'OK', { duration: 2000 });
  }

  copyId(): void {
    navigator.clipboard.writeText(this.data.roomId);
    this.snackBar.open('Room ID copied!', 'OK', { duration: 2000 });
  }
}
