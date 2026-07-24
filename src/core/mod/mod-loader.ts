import type { GameMod, ModLoader } from './types';
import type { Card } from '../models/types';
import { RuleEngine } from '../engine/rule-engine';

export class DefaultModLoader implements ModLoader {
  private mods: GameMod[] = [];

  register(mod: GameMod): void {
    this.mods.push(mod);
  }

  getActiveMods(): GameMod[] {
    return [...this.mods];
  }

  applyDeckPatches(base: Card[]): Card[] {
    return this.mods.reduce((deck, mod) => {
      return mod.patchDeck ? mod.patchDeck(deck) : deck;
    }, base);
  }

  applyRulePatches(engine: RuleEngine): RuleEngine {
    return this.mods.reduce((current, mod) => {
      return mod.patchEngine ? mod.patchEngine(current) : current;
    }, engine);
  }
}
