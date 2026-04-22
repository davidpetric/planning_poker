import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Subscription } from 'rxjs';
import { RoomService } from '../../services/room.service';
import { Player, Room } from '../../models/room.model';
import { InviteDialogComponent } from './invite-dialog.component';
import { JoinDialogComponent } from './join-dialog.component';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatChipsModule,
    MatBadgeModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './room.component.html',
  styleUrl: './room.component.scss',
})
export class RoomComponent implements OnInit, OnDestroy {
  room: Room | null = null;
  currentPlayerId: string | null = null;
  private subscription!: Subscription;

  constructor(
    private roomService: RoomService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    const roomId = this.route.snapshot.paramMap.get('id');
    if (!roomId) {
      this.router.navigate(['/']);
      return;
    }

    const existingRoom = this.roomService.reconnectToRoom(roomId);
    if (!existingRoom) {
      this.showJoinDialog(roomId);
    }

    this.subscription = this.roomService.room$.subscribe(room => {
      this.room = room;
      this.currentPlayerId = this.roomService.getCurrentPlayerId();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private showJoinDialog(roomId: string): void {
    const dialogRef = this.dialog.open(JoinDialogComponent, {
      disableClose: true,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((playerName: string) => {
      if (playerName) {
        const room = this.roomService.joinRoom(roomId, playerName);
        if (!room) {
          this.snackBar.open('Room not found', 'OK', { duration: 3000 });
          this.router.navigate(['/']);
        }
      } else {
        this.router.navigate(['/']);
      }
    });
  }

  get isHost(): boolean {
    return this.roomService.isCurrentPlayerHost();
  }

  get currentPlayer(): Player | undefined {
    return this.room?.players.find(p => p.id === this.currentPlayerId);
  }

  get otherPlayers(): Player[] {
    return this.room?.players.filter(p => p.id !== this.currentPlayerId) ?? [];
  }

  get averageVote(): string {
    if (!this.room) return '-';
    const numericVotes = this.room.players
      .map(p => p.vote)
      .filter((v): v is string => v !== null && v !== '?')
      .map(Number)
      .filter(n => !isNaN(n));

    if (numericVotes.length === 0) return '-';
    const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    return avg.toFixed(1);
  }

  get votedCount(): number {
    return this.room?.players.filter(p => p.vote !== null).length ?? 0;
  }

  selectCard(value: string): void {
    this.roomService.vote(value);
  }

  revealVotes(): void {
    this.roomService.revealVotes();
  }

  resetVotes(): void {
    this.roomService.resetVotes();
  }

  removePlayer(playerId: string): void {
    this.roomService.removePlayer(playerId);
  }

  showInviteDialog(): void {
    this.dialog.open(InviteDialogComponent, {
      width: '500px',
      data: { roomId: this.room?.id },
    });
  }

  leaveRoom(): void {
    this.roomService.leaveRoom();
    this.router.navigate(['/']);
  }

  getPlayerVoteDisplay(player: Player): string {
    if (!this.room) return '';
    if (this.room.revealed && player.vote) return player.vote;
    if (player.vote) return '✓';
    return '';
  }

  isCardSelected(value: string): boolean {
    return this.currentPlayer?.vote === value;
  }
}
