// ==================== 牌相 (Card Phases) ====================
export const CardPhase = {
  TIAN: '天', // 天相 - 赤红
  DI: '地',   // 地相 - 赭黄
  REN: '人',  // 人相 - 天青
  DAO: '道',  // 道相 - 三色
} as const;
export type CardPhase = typeof CardPhase[keyof typeof CardPhase];

export const PHASE_COLORS: Record<CardPhase, string> = {
  [CardPhase.TIAN]: '#C41E3A', // 赤红
  [CardPhase.DI]: '#B8860B',   // 赭黄
  [CardPhase.REN]: '#2E8B8B',  // 天青
  [CardPhase.DAO]: 'linear-gradient(90deg, #C41E3A, #B8860B, #2E8B8B)',
};

// ==================== 生肖 (Zodiac) ====================
export const ZODIAC = [
  '鼠', '牛', '虎', '兔', '龙', '蛇',
  '马', '羊', '猴', '鸡', '狗', '猪',
] as const;
export type Zodiac = (typeof ZODIAC)[number];

// ==================== 神兽 (Divine Beasts / Dice Faces) ====================
export const DivineBeast = {
  TIAN_LONG: '天龙',   // 顶面 - 死面(赤)
  BAI_YANG: '白羊',     // 底面 - 生面(皂)
  QING_LONG: '青龙',    // 东
  BAI_HU: '白虎',       // 西
  ZHU_QUE: '朱雀',      // 南
  XUAN_WU: '玄武',      // 北
} as const;
export type DivineBeast = typeof DivineBeast[keyof typeof DivineBeast];

export const DEATH_FACE = DivineBeast.TIAN_LONG;

// ==================== 小回合类型 ====================
export const RoundType = {
  ELECTION: 'election',       // 选举回合
  DRAW: 'draw',               // 抽牌回合
  TRUTH: 'truth',             // 真牌回合
  PLAY: 'play',               // 出牌回合
  OPEN: 'open',               // 开牌回合
  LIFE_DEATH: 'life_death',   // 生死回合
} as const;
export type RoundType = typeof RoundType[keyof typeof RoundType];

// ==================== 游戏阶段 ====================
export const GamePhase = {
  WAITING: 'waiting',         // 等待开始
  INSPIRING: 'inspiring',     // 激发回合（mod 扩展）
  ELECTION: 'election',       // 选举
  DRAWING: 'drawing',         // 抽牌
  TRUTH_DECLARE: 'truth',     // 真牌宣告
  PLAYING: 'playing',         // 出牌
  OPENING: 'opening',         // 开牌
  LIFE_DEATH: 'life_death',   // 生死
  GAME_OVER: 'game_over',     // 游戏结束
} as const;
export type GamePhase = typeof GamePhase[keyof typeof GamePhase];

// ==================== 常量 ====================
export const TOTAL_CARDS = 42;
export const CARDS_PER_PHASE = { [CardPhase.TIAN]: 12, [CardPhase.DI]: 12, [CardPhase.REN]: 12, [CardPhase.DAO]: 6 };
export const HAND_SIZE = 6;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MIN_PLAY_CARDS = 1;
export const MAX_PLAY_CARDS = 3;
export const DICE_FACES = 6;