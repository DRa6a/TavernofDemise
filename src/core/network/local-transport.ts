import type { NetworkTransport } from './types';

export class LocalTransport implements NetworkTransport {
  async connect(): Promise<void> {}

  disconnect(): void {}

  send(): void {}

  onEvent(): void {}
}
