import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Room } from '../models/room.model';

const WS_URL = 'ws://localhost:5107/ws';
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'dropped';

interface ServerMessage {
  type: 'joined' | 'state' | 'error';
  playerId?: string;
  room?: Room;
  message?: string;
}

class FatalHandshakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalHandshakeError';
  }
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private roomSubject = new BehaviorSubject<Room | null>(null);
  room$ = this.roomSubject.asObservable();

  private statusSubject = new BehaviorSubject<ConnectionStatus>('idle');
  status$ = this.statusSubject.asObservable();

  private socket: WebSocket | null = null;
  private currentPlayerId: string | null = null;
  private currentRoomId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private leaving = false;

  async createRoom(playerName: string, roomName: string): Promise<Room> {
    const { playerId, room } = await this.initialHandshake({
      type: 'create',
      playerName,
      roomName: roomName || 'Planning Poker',
    });
    this.setIdentity(playerId, room.id);
    this.roomSubject.next(room);
    this.statusSubject.next('connected');
    return room;
  }

  async joinRoom(roomId: string, playerName: string): Promise<Room | null> {
    try {
      const { playerId, room } = await this.initialHandshake({
        type: 'join',
        roomId,
        playerName,
      });
      this.setIdentity(playerId, room.id);
      this.roomSubject.next(room);
      this.statusSubject.next('connected');
      return room;
    } catch {
      this.statusSubject.next('idle');
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
      const { playerId, room } = await this.initialHandshake({
        type: 'reconnect',
        roomId,
        playerId: storedPlayerId,
      });
      this.setIdentity(playerId, room.id);
      this.roomSubject.next(room);
      this.statusSubject.next('connected');
      return room;
    } catch (err) {
      if (err instanceof FatalHandshakeError) {
        sessionStorage.removeItem(this.playerKey(roomId));
      }
      this.statusSubject.next('idle');
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
    this.leaving = true;
    this.cancelReconnectTimer();
    this.send({ type: 'leave' });
    if (this.currentRoomId) {
      sessionStorage.removeItem(this.playerKey(this.currentRoomId));
    }
    this.socket?.close();
    this.socket = null;
    this.currentPlayerId = null;
    this.currentRoomId = null;
    this.roomSubject.next(null);
    this.statusSubject.next('idle');
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

  private initialHandshake(
    message: object,
  ): Promise<{ playerId: string; room: Room }> {
    this.leaving = false;
    this.cancelReconnectTimer();
    this.statusSubject.next('connecting');
    return this.openSocket(message);
  }

  private openSocket(
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
            reject(new FatalHandshakeError(msg.message ?? 'Handshake failed'));
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
          this.handleDrop();
        }
      };
    });
  }

  private handleDrop(): void {
    if (this.leaving) return;
    if (!this.currentRoomId || !this.currentPlayerId) return;
    this.statusSubject.next('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.leaving) return;
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    const roomId = this.currentRoomId;
    const playerId = this.currentPlayerId;
    if (!roomId || !playerId || this.leaving) return;

    try {
      const { playerId: newId, room } = await this.openSocket({
        type: 'reconnect',
        roomId,
        playerId,
      });
      this.setIdentity(newId, room.id);
      this.roomSubject.next(room);
      this.statusSubject.next('connected');
      this.reconnectAttempts = 0;
    } catch (err) {
      if (err instanceof FatalHandshakeError) {
        sessionStorage.removeItem(this.playerKey(roomId));
        this.cancelReconnectTimer();
        this.currentPlayerId = null;
        this.currentRoomId = null;
        this.roomSubject.next(null);
        this.statusSubject.next('dropped');
        return;
      }
      this.scheduleReconnect();
    }
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }
}
