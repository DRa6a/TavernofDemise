// 默认实现：状态 / 阶段 / 回响 注册表
import type {
  EchoDefinition,
  EchoRegistry,
  PhaseDefinition,
  PhaseRegistry,
  PlayerStateEffect,
  PlayerStateRegistry,
} from './types';

export class DefaultPlayerStateRegistry implements PlayerStateRegistry {
  effects: Record<string, PlayerStateEffect> = {};

  register(effect: PlayerStateEffect): void {
    this.effects[effect.id] = effect;
  }

  get(id: string): PlayerStateEffect | undefined {
    return this.effects[id];
  }

  list(): PlayerStateEffect[] {
    return Object.values(this.effects);
  }
}

export class DefaultPhaseRegistry implements PhaseRegistry {
  phases: PhaseDefinition[] = [];

  register(phase: PhaseDefinition): void {
    this.phases.push(phase);
  }

  getInsertionPoint(point: PhaseDefinition['insertAt']): PhaseDefinition[] {
    return this.phases.filter((p) => p.insertAt === point);
  }

  list(): PhaseDefinition[] {
    return [...this.phases];
  }
}

export class DefaultEchoRegistry implements EchoRegistry {
  echoes: Record<string, EchoDefinition> = {};

  register(echo: EchoDefinition): void {
    this.echoes[echo.id] = echo;
  }

  get(id: string): EchoDefinition | undefined {
    return this.echoes[id];
  }

  list(): EchoDefinition[] {
    return Object.values(this.echoes);
  }
}
