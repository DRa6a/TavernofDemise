import type { Card } from '../models/types';
import type { RuleEngine } from '../engine/rule-engine';

export interface GameMod {
  id: string;
  name: string;
  version: string;

  patchDeck?(base: Card[]): Card[];
  patchEngine?(engine: RuleEngine): RuleEngine;
}

export interface ModLoader {
  register(mod: GameMod): void;
  getActiveMods(): GameMod[];
  applyDeckPatches(base: Card[]): Card[];
  applyRulePatches(engine: RuleEngine): RuleEngine;
}
