import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoomService } from '../../services/room.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  playerName = '';
  roomId = '';
  readonly errorMessage = signal('');
  readonly storedRooms = signal<string[]>([]);

  constructor(
    private roomService: RoomService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const stored = this.roomService.getStoredName();
    if (stored) this.playerName = stored;
    this.storedRooms.set(this.roomService.getStoredRooms());
  }

  forgetRoom(roomId: string): void {
    this.roomService.forgetRoom(roomId);
    this.storedRooms.set(this.roomService.getStoredRooms());
  }

  async createRoom(): Promise<void> {
    if (!this.playerName.trim()) return;

    try {
      const room = await this.roomService.createRoom(this.playerName.trim());
      this.router.navigate(['/room', room.id]);
    } catch (err) {
      this.errorMessage.set('Could not reach the server. Is the backend running?');
    }
  }

  async joinRoom(): Promise<void> {
    if (!this.playerName.trim() || !this.roomId.trim()) return;

    const result = await this.roomService.joinRoom(
      this.roomId.trim().toUpperCase(),
      this.playerName.trim(),
    );
    if ('room' in result) {
      this.router.navigate(['/room', result.room.id]);
    } else {
      this.errorMessage.set(result.error);
    }
  }
}
