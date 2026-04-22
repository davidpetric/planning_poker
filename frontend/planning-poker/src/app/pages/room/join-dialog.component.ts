import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

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
        <input matInput [(ngModel)]="playerName" placeholder="Enter your name" (keyup.enter)="join()">
        <mat-icon matPrefix>person</mat-icon>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(null)">Cancel</button>
      <button mat-raised-button color="primary" (click)="join()" [disabled]="!playerName.trim()">
        Join
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    p { margin-bottom: 16px; color: #666; }
  `],
})
export class JoinDialogComponent {
  playerName = '';

  constructor(public dialogRef: MatDialogRef<JoinDialogComponent>) {}

  join(): void {
    if (this.playerName.trim()) {
      this.dialogRef.close(this.playerName.trim());
    }
  }
}
