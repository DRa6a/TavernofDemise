import { GameEvent } from '../models/types';

export interface NetworkTransport {
  connect(roomId: string): Promise<void>;
  disconnect(): void;
  send(event: GameEvent): void;
  onEvent(handler: (event: GameEvent) => void): void;
}
