import { Component, OnInit, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { ConnectionStatus, RoomService } from '../../services/room.service';
import { Player, Room } from '../../models/room.model';
import { InviteDialogComponent } from './invite-dialog.component';
import { JoinDialogComponent } from './join-dialog.component';
import { SettingsDialogComponent } from './settings-dialog.component';
import { RenameDialogComponent } from './rename-dialog.component';

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
export class RoomComponent implements OnInit {
  private readonly roomService = inject(RoomService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly room = toSignal(this.roomService.room$, { initialValue: null as Room | null });
  readonly status = toSignal(this.roomService.status$, {
    initialValue: 'idle' as ConnectionStatus,
  });
  readonly isReconnecting = computed(() => this.status() === 'reconnecting');

  constructor() {
    effect(() => {
      if (this.status() === 'dropped') {
        this.snackBar.open(
          'Disconnected from the room. It may have been closed.',
          'OK',
          { duration: 5000 },
        );
        this.router.navigate(['/']);
      }
    });
  }

  ngOnInit(): void {
    const roomId = this.route.snapshot.paramMap.get('id');
    if (!roomId) {
      this.router.navigate(['/']);
      return;
    }

    this.roomService.reconnectToRoom(roomId).then(async existingRoom => {
      if (existingRoom) return;
      const stored = this.roomService.getStoredName();
      if (stored) {
        const result = await this.roomService.joinRoom(roomId, stored);
        if ('room' in result) return;
        this.showJoinDialog(roomId, stored, result.error);
        return;
      }
      this.showJoinDialog(roomId);
    });
  }

  get currentPlayerId(): string | null {
    return this.roomService.getCurrentPlayerId();
  }

  private showJoinDialog(roomId: string, initialName?: string, initialError?: string): void {
    const dialogRef = this.dialog.open<
      JoinDialogComponent,
      { roomId: string; initialName?: string; initialError?: string },
      Room | null
    >(
      JoinDialogComponent,
      { disableClose: true, width: '400px', data: { roomId, initialName, initialError } },
    );
    dialogRef.afterClosed().subscribe(room => {
      if (!room) this.router.navigate(['/']);
    });
  }

  get isHost(): boolean {
    return this.roomService.isCurrentPlayerHost();
  }

  get currentPlayer(): Player | undefined {
    return this.room()?.players.find(p => p.id === this.currentPlayerId);
  }

  get otherPlayers(): Player[] {
    const playerId = this.currentPlayerId;
    return this.room()?.players.filter(p => p.id !== playerId) ?? [];
  }

  get averageVote(): string {
    const room = this.room();
    if (!room) return '-';
    const numericVotes = room.players
      .map(p => p.vote)
      .filter((v): v is string => v !== null && v !== '?')
      .map(Number)
      .filter(n => !isNaN(n));

    if (numericVotes.length === 0) return '-';
    const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    return avg.toFixed(1);
  }

  get votedCount(): number {
    return this.room()?.players.filter(p => p.vote !== null).length ?? 0;
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
      data: { roomId: this.room()?.id },
    });
  }

  showSettingsDialog(): void {
    const room = this.room();
    if (!room) return;
    this.dialog.open(SettingsDialogComponent, {
      width: '500px',
      data: { cardValues: room.cardValues, hostOnlyControls: room.hostOnlyControls },
    });
  }

  showRenameDialog(): void {
    const room = this.room();
    const playerId = this.currentPlayerId;
    if (!room || !playerId) return;
    const me = room.players.find(p => p.id === playerId);
    if (!me) return;
    const takenNames = room.players.filter(p => p.id !== playerId).map(p => p.name);
    this.dialog.open(RenameDialogComponent, {
      width: '400px',
      data: { currentName: me.name, takenNames },
    });
  }

  leaveRoom(): void {
    this.roomService.leaveRoom();
    this.router.navigate(['/']);
  }

  getPlayerVoteDisplay(player: Player): string {
    const room = this.room();
    if (!room) return '';
    if (room.revealed && player.vote) return player.vote;
    if (player.vote) return '✓';
    return '';
  }

  isCardSelected(value: string): boolean {
    return this.currentPlayer?.vote === value;
  }
}
