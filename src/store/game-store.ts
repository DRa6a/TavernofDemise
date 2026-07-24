import { create } from 'zustand';
import { RoundManager } from '../core/engine/round-manager';
import { BaseStrategy } from '../core/ai/base-strategy';
import { SeededRandom } from '../core/engine/random';
import { GamePhase } from '../utils/constants';
import type { GameState, Player, PlayerConfig } from '../core/models/types';

interface GameStore {
  manager: RoundManager | null;
  gameState: GameState | null;
  selectedCardIds: string[];
  aiThinking: boolean;

  startGame: (configs: PlayerConfig[]) => void;
  playCards: (cardIds: string[]) => void;
  openPhase: (decision: 'challenge' | 'pass') => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  toggleCard: (cardId: string) => void;
  clearSelection: () => void;
  runAiLoop: () => void;
}

const HUMAN_ID = 'p0';

function createManager(): RoundManager {
  return new RoundManager(new SeededRandom(Date.now()));
}

function getActivePlayer(state: GameState): Player | undefined {
  return state.players.find((p) => p.id === state.activePlayerId);
}

function isHumanTurn(state: GameState): boolean {
  const player = getActivePlayer(state);
  return player ? player.isHuman : false;
}

export const useGameStore = create<GameStore>((set, get) => ({
  manager: null,
  gameState: null,
  selectedCardIds: [],
  aiThinking: false,

  startGame: (configs) => {
    const manager = createManager();
    manager.startGame(configs);
    set({ manager, gameState: { ...manager.getState() }, selectedCardIds: [] });
    get().runAiLoop();
  },

  playCards: (cardIds) => {
    const { manager } = get();
    if (!manager) return;
    manager.playCards(manager.getState().activePlayerId, cardIds);
    set({ gameState: { ...manager.getState() }, selectedCardIds: [] });
    get().runAiLoop();
  },

  openPhase: (decision) => {
    const { manager } = get();
    if (!manager) return;
    manager.openPhase(decision);
    set({ gameState: { ...manager.getState() } });
    get().runAiLoop();
  },

  selectCard: (cardId) => {
    set((state) => ({
      selectedCardIds: [...state.selectedCardIds, cardId],
    }));
  },

  deselectCard: (cardId) => {
    set((state) => ({
      selectedCardIds: state.selectedCardIds.filter((id) => id !== cardId),
    }));
  },

  toggleCard: (cardId) => {
    set((state) => ({
      selectedCardIds: state.selectedCardIds.includes(cardId)
        ? state.selectedCardIds.filter((id) => id !== cardId)
        : [...state.selectedCardIds, cardId],
    }));
  },

  clearSelection: () => set({ selectedCardIds: [] }),

  runAiLoop: () => {
    const store = get();
    if (!store.manager || !store.gameState) return;

    const state = store.gameState;
    if (state.phase === GamePhase.GAME_OVER) return;

    const player = getActivePlayer(state);
    if (!player || player.isHuman || player.isDead || player.isOutOfRound) return;

    set({ aiThinking: true });

    window.setTimeout(() => {
      const { manager } = get();
      if (!manager) return;

      const currentState = manager.getState();
      const aiPlayer = getActivePlayer(currentState);
      if (!aiPlayer || aiPlayer.isHuman || aiPlayer.isDead || aiPlayer.isOutOfRound) {
        set({ aiThinking: false });
        return;
      }

      const random = new SeededRandom(Date.now());
      const strategy = new BaseStrategy(random);

      if (currentState.phase === GamePhase.PLAYING) {
        const cards = strategy.decidePlay({ player: aiPlayer, state: currentState, lastPlay: currentState.lastPlay });
        manager.playCards(aiPlayer.id, cards.map((c) => c.id));
      } else if (currentState.phase === GamePhase.OPENING) {
        const shouldChallenge = strategy.decideChallenge({
          player: aiPlayer,
          state: currentState,
          lastPlay: currentState.lastPlay,
        });
        manager.openPhase(shouldChallenge ? 'challenge' : 'pass');
      }

      set({ gameState: { ...manager.getState() }, aiThinking: false });
      get().runAiLoop();
    }, 800);
  },
}));

export { HUMAN_ID, getActivePlayer, isHumanTurn };
