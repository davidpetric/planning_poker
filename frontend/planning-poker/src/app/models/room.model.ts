export interface Player {
  id: string;
  name: string;
  vote: string | null;
  isHost: boolean;
}

export interface Room {
  id: string;
  name: string;
  players: Player[];
  revealed: boolean;
  cardValues: string[];
}

export const FIBONACCI_CARDS = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'];
