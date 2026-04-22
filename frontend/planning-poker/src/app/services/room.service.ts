import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Room } from '../models/room.model';

const WS_URL = 'ws://localhost:5107/ws';

interface ServerMessage {
  type: 'joined' | 'state' | 'error';
  playerId?: string;
  room?: Room;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private roomSubject = new BehaviorSubject<Room | null>(null);
  room$ = this.roomSubject.asObservable();

  private socket: WebSocket | null = null;
  private currentPlayerId: string | null = null;
  private currentRoomId: string | null = null;

  async createRoom(playerName: string, roomName: string): Promise<Room> {
    const { playerId, room } = await this.connectAndHandshake({
      type: 'create',
      playerName,
      roomName: roomName || 'Planning Poker',
    });
    this.setIdentity(playerId, room.id);
    this.roomSubject.next(room);
    return room;
  }

  async joinRoom(roomId: string, playerName: string): Promise<Room | null> {
    try {
      const { playerId, room } = await this.connectAndHandshake({
        type: 'join',
        roomId,
        playerName,
      });
      this.setIdentity(playerId, room.id);
      this.roomSubject.next(room);
      return room;
    } catch {
      return null;
    }
  }

  async reconnectToRoom(roomId: string): Promise<Room | null> {
    const current = this.roomSubject.value;
    if (
      current?.id === roomId &&
      this.currentPlayerId &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      return current;
    }

    const storedPlayerId = sessionStorage.getItem(this.playerKey(roomId));
    if (!storedPlayerId) return null;
    try {
      const { playerId, room } = await this.connectAndHandshake({
        type: 'reconnect',
        roomId,
        playerId: storedPlayerId,
      });
      this.setIdentity(playerId, room.id);
      this.roomSubject.next(room);
      return room;
    } catch {
      sessionStorage.removeItem(this.playerKey(roomId));
      return null;
    }
  }

  vote(value: string): void {
    this.send({ type: 'vote', value });
  }

  revealVotes(): void {
    this.send({ type: 'reveal' });
  }

  resetVotes(): void {
    this.send({ type: 'reset' });
  }

  removePlayer(playerId: string): void {
    this.send({ type: 'remove', playerId });
  }

  leaveRoom(): void {
    this.send({ type: 'leave' });
    if (this.currentRoomId) {
      sessionStorage.removeItem(this.playerKey(this.currentRoomId));
    }
    this.socket?.close();
    this.socket = null;
    this.currentPlayerId = null;
    this.currentRoomId = null;
    this.roomSubject.next(null);
  }

  getCurrentPlayerId(): string | null {
    return this.currentPlayerId;
  }

  isCurrentPlayerHost(): boolean {
    const room = this.roomSubject.value;
    if (!room || !this.currentPlayerId) return false;
    return room.players.find(p => p.id === this.currentPlayerId)?.isHost ?? false;
  }

  private setIdentity(playerId: string, roomId: string): void {
    this.currentPlayerId = playerId;
    this.currentRoomId = roomId;
    sessionStorage.setItem(this.playerKey(roomId), playerId);
  }

  private playerKey(roomId: string): string {
    return `planning-poker-player-${roomId}`;
  }

  private send(msg: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private connectAndHandshake(
    handshake: object,
  ): Promise<{ playerId: string; room: Room }> {
    return new Promise((resolve, reject) => {
      this.socket?.close();
      const socket = new WebSocket(WS_URL);
      this.socket = socket;

      let settled = false;

      socket.onopen = () => socket.send(JSON.stringify(handshake));

      socket.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!settled) {
          if (msg.type === 'joined' && msg.playerId && msg.room) {
            settled = true;
            resolve({ playerId: msg.playerId, room: msg.room });
          } else if (msg.type === 'error') {
            settled = true;
            reject(new Error(msg.message ?? 'Handshake failed'));
            socket.close();
          }
          return;
        }
        if (msg.type === 'state' && msg.room) {
          this.roomSubject.next(msg.room);
        }
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };

      socket.onclose = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before handshake'));
        }
        if (this.socket === socket) {
          this.socket = null;
          this.roomSubject.next(null);
        }
      };
    });
  }
}
