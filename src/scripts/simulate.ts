import { GameRunner } from '../core/engine/game-runner';
import { BaseStrategy } from '../core/ai/base-strategy';
import { SeededRandom } from '../core/engine/random';
import { GamePhase } from '../utils/constants';

function runBatch(count: number, playerCount: number): void {
  let finished = 0;
  let errors = 0;
  const roundCounts: number[] = [];

  for (let i = 0; i < count; i++) {
    let runner: GameRunner | undefined;
    try {
      const random = new SeededRandom(Date.now() + i);
      const configs = Array.from({ length: playerCount }, (_, index) => ({
        id: `p${index}`,
        name: `玩家 ${index + 1}`,
        isHuman: false,
      }));

      runner = new GameRunner({
        playerConfigs: configs,
        strategyFactory: (r) => new BaseStrategy(r),
        random,
      });

      runner.run();
      const state = runner.getState();

      if (state.phase === GamePhase.GAME_OVER && state.winnerId) {
        finished++;
        roundCounts.push(state.currentRound);
      }
    } catch (e) {
      errors++;
      if (i < 3 && runner) {
        console.error(`第 ${i + 1} 局历史:`);
        runner.getState().history.forEach((h, idx) => console.error(idx, JSON.stringify(h)));
      }
      console.error(`第 ${i + 1} 局出错:`, e);
    }
  }

  const avgRounds = roundCounts.length > 0
    ? (roundCounts.reduce((a, b) => a + b, 0) / roundCounts.length).toFixed(2)
    : 'N/A';

  console.log(`运行 ${count} 局 ${playerCount} 人对战:`);
  console.log(`  正常结束: ${finished}`);
  console.log(`  异常: ${errors}`);
  console.log(`  平均回合数: ${avgRounds}`);
}

runBatch(100, 4);
