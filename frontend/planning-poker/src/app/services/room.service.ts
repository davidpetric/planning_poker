import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Player, Room, FIBONACCI_CARDS } from '../models/room.model';

@Injectable({ providedIn: 'root' })
export class RoomService {
  private roomSubject = new BehaviorSubject<Room | null>(null);
  room$ = this.roomSubject.asObservable();

  private channel: BroadcastChannel | null = null;
  private currentPlayerId: string | null = null;

  private getStorageKey(roomId: string): string {
    return `planning-poker-room-${roomId}`;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(playerName: string, roomName: string): Room {
    const playerId = this.generateId();
    this.currentPlayerId = playerId;

    const room: Room = {
      id: this.generateId(),
      name: roomName || 'Planning Poker',
      players: [
        { id: playerId, name: playerName, vote: null, isHost: true }
      ],
      revealed: false,
      cardValues: FIBONACCI_CARDS,
    };

    this.persistRoom(room);
    this.subscribeToChannel(room.id);
    this.roomSubject.next(room);
    sessionStorage.setItem('playerId', playerId);
    return room;
  }

  joinRoom(roomId: string, playerName: string): Room | null {
    const room = this.loadRoom(roomId);
    if (!room) return null;

    const existingPlayer = room.players.find(p => p.name === playerName);
    if (existingPlayer) {
      this.currentPlayerId = existingPlayer.id;
      sessionStorage.setItem('playerId', existingPlayer.id);
    } else {
      const playerId = this.generateId();
      this.currentPlayerId = playerId;
      room.players.push({ id: playerId, name: playerName, vote: null, isHost: false });
      sessionStorage.setItem('playerId', playerId);
      this.persistRoom(room);
      this.broadcastUpdate(room);
    }

    this.subscribeToChannel(room.id);
    this.roomSubject.next(room);
    return room;
  }

  reconnectToRoom(roomId: string): Room | null {
    const playerId = sessionStorage.getItem('playerId');
    if (!playerId) return null;

    const room = this.loadRoom(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return null;

    this.currentPlayerId = playerId;
    this.subscribeToChannel(room.id);
    this.roomSubject.next(room);
    return room;
  }

  vote(value: string): void {
    const room = this.roomSubject.value;
    if (!room || !this.currentPlayerId || room.revealed) return;

    const player = room.players.find(p => p.id === this.currentPlayerId);
    if (!player) return;

    player.vote = player.vote === value ? null : value;
    this.persistRoom(room);
    this.broadcastUpdate(room);
    this.roomSubject.next({ ...room });
  }

  revealVotes(): void {
    const room = this.roomSubject.value;
    if (!room) return;

    room.revealed = true;
    this.persistRoom(room);
    this.broadcastUpdate(room);
    this.roomSubject.next({ ...room });
  }

  resetVotes(): void {
    const room = this.roomSubject.value;
    if (!room) return;

    room.players.forEach(p => p.vote = null);
    room.revealed = false;
    this.persistRoom(room);
    this.broadcastUpdate(room);
    this.roomSubject.next({ ...room });
  }

  removePlayer(playerId: string): void {
    const room = this.roomSubject.value;
    if (!room) return;

    room.players = room.players.filter(p => p.id !== playerId);
    this.persistRoom(room);
    this.broadcastUpdate(room);
    this.roomSubject.next({ ...room });
  }

  getCurrentPlayerId(): string | null {
    return this.currentPlayerId;
  }

  isCurrentPlayerHost(): boolean {
    const room = this.roomSubject.value;
    if (!room || !this.currentPlayerId) return false;
    const player = room.players.find(p => p.id === this.currentPlayerId);
    return player?.isHost ?? false;
  }

  private persistRoom(room: Room): void {
    localStorage.setItem(this.getStorageKey(room.id), JSON.stringify(room));
  }

  private loadRoom(roomId: string): Room | null {
    const data = localStorage.getItem(this.getStorageKey(roomId));
    return data ? JSON.parse(data) : null;
  }

  private subscribeToChannel(roomId: string): void {
    this.channel?.close();
    this.channel = new BroadcastChannel(`planning-poker-${roomId}`);
    this.channel.onmessage = (event) => {
      const updatedRoom: Room = event.data;
      this.roomSubject.next(updatedRoom);
    };
  }

  private broadcastUpdate(room: Room): void {
    this.channel?.postMessage(room);
  }

  leaveRoom(): void {
    const room = this.roomSubject.value;
    if (room && this.currentPlayerId) {
      this.removePlayer(this.currentPlayerId);
    }
    this.channel?.close();
    this.channel = null;
    this.currentPlayerId = null;
    this.roomSubject.next(null);
  }
}
