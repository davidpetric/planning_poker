import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { RoomService } from '../../services/room.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatDividerModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  playerName = '';
  roomName = '';
  roomId = '';
  errorMessage = '';

  constructor(
    private roomService: RoomService,
    private router: Router,
  ) {}

  async createRoom(): Promise<void> {
    if (!this.playerName.trim()) return;

    try {
      const room = await this.roomService.createRoom(
        this.playerName.trim(),
        this.roomName.trim() || 'Planning Poker',
      );
      this.router.navigate(['/room', room.id]);
    } catch (err) {
      this.errorMessage = 'Could not reach the server. Is the backend running?';
    }
  }

  async joinRoom(): Promise<void> {
    if (!this.playerName.trim() || !this.roomId.trim()) return;

    const room = await this.roomService.joinRoom(
      this.roomId.trim().toUpperCase(),
      this.playerName.trim(),
    );
    if (room) {
      this.router.navigate(['/room', room.id]);
    } else {
      this.errorMessage = 'Room not found. Please check the Room ID.';
    }
  }
}
