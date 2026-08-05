// 默认注册表：状态 / 阶段 / 能力
// 注意：本文件不依赖任何 mod 业务概念（echo / state / phase 等具体语义），
// 全部使用通用名 abilities / states / phases。
import type {
  AbilityDefinition,
  AbilityRegistry,
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

export class DefaultAbilityRegistry implements AbilityRegistry {
  abilities: Record<string, AbilityDefinition> = {};

  register(ability: AbilityDefinition): void {
    this.abilities[ability.id] = ability;
  }

  get(id: string): AbilityDefinition | undefined {
    return this.abilities[id];
  }

  list(): AbilityDefinition[] {
    return Object.values(this.abilities);
  }
}

// 向后兼容别名
/** @deprecated 使用 DefaultAbilityRegistry */
export const DefaultEchoRegistry = DefaultAbilityRegistry;
