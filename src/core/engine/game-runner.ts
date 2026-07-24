import { GamePhase, PlayerConfig } from '../../utils/constants';
import { AIStrategy } from '../ai/types';
import { RandomProvider } from './random';
import { RoundManager } from './round-manager';

export interface GameRunnerOptions {
  playerConfigs: PlayerConfig[];
  strategyFactory: (random: RandomProvider) => AIStrategy;
  random: RandomProvider;
}

export class GameRunner {
  private manager: RoundManager;
  private strategy: AIStrategy;

  constructor(private options: GameRunnerOptions) {
    this.manager = new RoundManager(options.random);
    this.strategy = options.strategyFactory(options.random);
  }

  run(): void {
    this.manager.startGame(this.options.playerConfigs);

    let steps = 0;
    const maxSteps = 10000;

    while (this.manager.getState().phase !== GamePhase.GAME_OVER && steps < maxSteps) {
      this.step();
      steps++;
    }
  }

  step(): void {
    const state = this.manager.getState();

    if (state.phase === GamePhase.PLAYING) {
      const player = state.players.find((p) => p.id === state.activePlayerId);
      if (!player) return;

      const cards = this.strategy.decidePlay({ player, state, lastPlay: state.lastPlay });
      if (cards.length === 0) {
        console.error(`AI 返回空出牌: ${player.id}, hand=${player.hand.length}, out=${player.isOutOfRound}, dead=${player.isDead}`);
      }
      this.manager.playCards(player.id, cards.map((c) => c.id));
      return;
    }

    if (state.phase === GamePhase.OPENING) {
      const player = state.players.find((p) => p.id === state.activePlayerId);
      if (!player) return;

      const shouldChallenge = this.strategy.decideChallenge({
        player,
        state,
        lastPlay: state.lastPlay,
      });
      this.manager.openPhase(shouldChallenge ? 'challenge' : 'pass');
    }
  }

  getState() {
    return this.manager.getState();
  }
}
