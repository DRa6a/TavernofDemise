# 终焉酒馆 — 技术实现方案

> 版本：v1.0  
> 目标：作为后续代码实现的总体设计文档，**不含具体业务代码**，仅定义架构、模块、接口与数据流。

---

## 一、项目概述

本项目是基于《十日终焉》同人规则“天羊游戏—终焉酒馆”制作的网页卡牌游戏。当前阶段聚焦**人机对战**，但架构必须为后续**模组加载、局域网联机、连接服务器**预留扩展空间。客户端以**移动端优先**适配，兼顾桌面端体验。

---

## 二、技术栈选型

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| 构建工具 | **Vite 6** | 冷启动快、HMR 体验好、对 TS/ESM 原生支持完善，适合快速迭代。 |
| 框架 | **React 19** | 组件化成熟、生态庞大，配合 Hooks 可清晰表达回合状态机。 |
| 语言 | **TypeScript 5** | 强类型约束复杂游戏规则，减少运行时错误，便于后续多人协作。 |
| 状态管理 | **Zustand** | 轻量、无样板代码、支持切片（slice），适合以“事件驱动”更新游戏状态。 |
| 动画/交互 | **Framer Motion** | 声明式动画，方便实现卡牌飞入、掷骰子、死亡结算等高冲击力的动效。 |
| 样式 | **CSS Modules / CSS Variables** | 避免样式冲突，主题色与响应式断点统一在 `:root` 管理。 |
| 包管理 | **npm** | 默认集成，无需额外学习成本。 |

---

## 三、总体架构

采用 **“核心引擎 + 状态管理 + UI 表现层”** 三层架构：

```
┌─────────────────────────────────────────────┐
│              UI 表现层 (React)               │
│  屏幕 / 组件 / 手势 / 动画 / 音效 / 振动反馈   │
├─────────────────────────────────────────────┤
│           状态管理层 (Zustand Store)          │
│  将引擎事件同步到 UI，并收集玩家输入转发给引擎  │
├─────────────────────────────────────────────┤
│           游戏核心引擎 (TypeScript)           │
│  模型 / 规则 / 状态机 / AI / Mod / 网络抽象层  │
└─────────────────────────────────────────────┘
```

**核心设计原则：**

1. **引擎无 UI**：`core/` 目录只包含纯逻辑，不引用 React/DOM，便于单元测试和后续移植到服务器。
2. **确定性**：所有随机行为（抽牌、掷骰、AI 决策）通过统一的 `RandomProvider` 注入，支持种子回放和联机同步。
3. **事件驱动**：引擎以 `GameEvent` 形式暴露状态变化，Store 消费事件并更新 UI。
4. **Mod 友好**：规则、卡牌效果、AI 策略均通过接口抽象，异卷（Mod）可覆写或扩展。

---

## 四、目录结构

```
zhongyan-tavern/
├── docs/                      # 设计文档
│   ├── tech-spec.md           # 本文件
│   └── development-flow.md    # 开发流程
├── public/                    # 静态资源（牌背、音效、字体）
├── src/
│   ├── core/                  # 纯逻辑引擎
│   │   ├── models/            # 数据模型与类型
│   │   ├── engine/            # 游戏主循环、状态机、规则校验
│   │   ├── ai/                # AI 决策器与策略
│   │   ├── mod/               # 模组系统（接口定义 + 加载器）
│   │   └── network/           # 网络抽象层（预留）
│   ├── store/                 # Zustand 全局状态
│   ├── ui/                    # React 视图
│   │   ├── components/        # 通用组件（牌、骰子、按钮、弹窗）
│   │   ├── screens/           # 全屏场景（主菜单、对局、结算）
│   │   └── hooks/             # UI 专用 Hooks
│   ├── utils/                 # 工具函数、常量
│   └── main.tsx               # 入口
├── index.html
├── package.json
└── tsconfig.json
```

---

## 五、核心数据模型

### 5.1 卡牌（Card）

- **牌相（phase）**：天 / 地 / 人 / 道
- **肖子（zodiac）**：鼠~猪，仅天/地/人牌具有；道牌无肖子
- **唯一标识（id）**：保证牌堆、手牌、出牌区中的每一张牌可追踪
- **色语（colorHint）**：由 UI 根据牌相渲染，不进入核心逻辑

伪代码示例：

```ts
interface Card {
  id: string;
  phase: '天' | '地' | '人' | '道';
  zodiac?: Zodiac;     // 道牌无肖子
}
```

### 5.2 玩家（Player）

- **id / name / avatar**：基本信息
- **isHuman**：区分人类与 AI
- **hand**：当前手牌（暗牌，对其它玩家不可见）
- **isDead**：是否死亡
- **isOutOfRound**：是否在本大回合中“观战”（手牌出完且未参与生死）
- **position**：圆桌座位索引，用于决定上下家

### 5.3 神兽骰子（DivineDice）

- 六个面：天龙（死面）、白羊、青龙、白虎、朱雀、玄武
- 被抽过的面置为“出局神兽（灰）”，后续不可再被抽到
- 每大回合重置一次可用面池

### 5.4 游戏状态（GameState）

集中保存一局游戏的所有可变信息：

```ts
interface GameState {
  phase: GamePhase;              // 当前所处阶段
  players: Player[];             // 所有参与者
  deck: Card[];                  // 剩余牌堆
  discardPile: Card[];           // 弃牌堆
  currentRound: number;          // 第几大回合
  currentSubRound: SubRoundType; // 当前小回合类型
  activePlayerId: string;        // 当前主参与者
  lastPlay?: {                   // 上一次出牌记录
    playerId: string;
    cards: Card[];
    declaredCount: number;       // 宣称张数
    isRevealed: boolean;         // 是否已被翻开
  };
  truthPhase?: {                 // 真牌回合结果
    truthPhase: '天' | '地' | '人';
  };
  dice: DivineDice;              // 神兽骰子状态
  deadFaces: DivineBeast[];      // 已出局神兽
  winnerId?: string;             // 胜利者
  history: GameEvent[];          // 事件日志（用于回放与同步）
}
```

---

## 六、游戏状态机

引擎通过状态机驱动小回合流转，关键状态转换如下：

```
WAITING
  │ 开始游戏
  ▼
ELECTION ──→ 选出首个出牌人
  │
  ▼
DRAW ──→ 每人盲抽 6 张手牌
  │
  ▼
TRUTH ──→ 随机宣布一种牌相为“真牌”
  │
  ▼
PLAY ──→ 主参与者出 1~3 张暗牌
  │
  ▼
OPEN ──→ 下家决定是否质疑上家
  │ 质疑失败/成功
  ▼
LIFE_DEATH ──→ 神兽判决生死
  │
  ▼
（若未结束）回到 DRAW 或 PLAY，依规则继续
```

**关键规则点映射：**

| 规则 | 状态机处理 |
|------|-----------|
| 真牌与假牌判定 | 在出牌进入出牌区时计算：`containsFake = cards.some(c => c.phase !== truthPhase && c.phase !== '道')` |
| 质疑赌命 | `OPEN` 阶段由当前主参与者调用 `challenge()`，状态机进入 `LIFE_DEATH` |
| 手牌出完且剩余 >1 人 | 标记 `isOutOfRound = true`，上下家指针跳过该玩家 |
| 剩余仅 1 人时必须质疑 | `OPEN` 阶段强制 `mustChallenge = true` |
| 死亡后顺位继承 | `LIFE_DEATH` 结束后，若死者为当前主参与者，则顺时针找到下一个存活玩家作为新一轮首个出牌人 |
| 最终胜利 | 仅剩一名存活玩家时进入 `GAME_OVER` |

---

## 七、核心模块设计

### 7.1 牌堆构建器（DeckBuilder）

职责：生成一副标准 42 张牌，支持后续 Mod 替换牌组。

- 天/地/人各 12 张，每种牌相内 12 个肖子各一张
- 道 6 张，无肖子
- 提供 `buildStandardDeck(): Card[]`
- 提供 `buildDeck(config: DeckConfig): Card[]` 供 Mod 调用

### 7.2 洗牌与发牌器（Shuffler）

- 依赖 `RandomProvider` 进行洗牌
- 支持“盲抽”：从牌堆顶部取牌
- 抽牌后更新 `deck` 与玩家 `hand`

### 7.3 规则引擎（RuleEngine）

职责：所有规则判断的单一入口，防止 UI 层随意修改状态。

主要接口：

```ts
interface RuleEngine {
  canPlay(player: Player, cards: Card[], state: GameState): boolean;
  isPlayFake(cards: Card[], truthPhase: CardPhase): boolean;
  canChallenge(state: GameState): boolean;
  mustChallenge(state: GameState): boolean;
  resolveChallenge(state: GameState): ChallengeResult;
  resolveDice(player: Player, dice: DivineDice): LifeDeathResult;
  getNextActivePlayer(state: GameState): string;
}
```

### 7.4 回合管理器（RoundManager）

职责：维护大回合与小回合的推进。

主要接口：

```ts
interface RoundManager {
  startGame(players: PlayerConfig[]): void;
  electFirstPlayer(): string;
  startRound(): void;              // 进入抽牌
  declareTruthPhase(): CardPhase;  // 真牌回合
  playCards(playerId: string, cardIds: string[]): void;
  openPhase(decision: 'challenge' | 'pass'): void;
  resolveLifeDeath(): void;
  finishRound(): void;
}
```

---

## 八、AI 决策系统

当前阶段所有非人类玩家由 AI 驱动。AI 设计为**可插拔策略**，便于后续扩展不同难度与性格。

### 8.1 决策时机

1. **出牌阶段（PLAY）**：AI 决定出哪些牌
2. **开牌阶段（OPEN）**：AI 决定是否质疑上家

### 8.2 基础策略（BaseStrategy）

#### 出牌策略

- 优先保留真牌，出假牌；若手牌真牌多，则混出道牌降低风险
- 观察上家出牌历史，评估其说谎概率
- 尽量控制每轮出牌数在 1~3 张之间

#### 质疑策略

- 计算上家说谎概率：
  - 基于上家剩余手牌结构推断
  - 基于上家过往出牌被翻开记录
  - 基于场上已被打出的真牌数量
- 当概率超过阈值且自身风险可控时质疑
- 若剩余仅 1 名对手，必须质疑时选择最优时机

### 8.3 策略接口

```ts
interface AIStrategy {
  name: string;
  difficulty: number; // 1~5

  decidePlay(context: AIContext): Card[];
  decideChallenge(context: AIContext): boolean;
}
```

### 8.4 AI 难度规划

| 难度 | 特点 |
|------|------|
| 简单 | 随机出牌，低概率质疑 |
| 普通 | 基础概率计算，会避开明显风险 |
| 困难 | 记忆牌堆、估算对手手牌、利用心理博弈 |
| 极限 | 近似最优解，适合作为挑战目标 |

---

## 九、Mod（异卷）系统设计

Mod 是规则的“拓展或覆写”。本系统通过**接口替换 + 配置注入**实现。

### 9.1 Mod 可覆写内容

- 牌堆构成（增减牌相、肖子、特殊牌）
- 胜利条件
- AI 策略
- 回合流程（通过自定义状态机节点）
- UI 主题与文案

### 9.2 Mod 加载器（ModLoader）

```ts
interface ModLoader {
  register(mod: GameMod): void;
  getActiveMods(): GameMod[];
  applyDeckPatches(base: Card[]): Card[];
  applyRulePatches(engine: RuleEngine): RuleEngine;
}
```

### 9.3 Mod 文件格式

单个 Mod 为一个 TypeScript 模块，导出 `GameMod` 接口实现。运行时通过动态 `import()` 加载，便于后续实现“从本地文件/服务器加载 Mod”。

### 9.4 沙箱与校验

- Mod 仅允许覆写白名单接口
- 关键规则变更需用户二次确认
- 联机模式下，Mod 由房主统一决定，所有客户端加载一致版本

---

## 十、网络联机预留

当前版本不实现网络，但架构必须为后续扩展保留位置。

### 10.1 网络抽象层（Network Abstraction）

```ts
interface NetworkTransport {
  connect(roomId: string): Promise<void>;
  disconnect(): void;
  send(event: GameEvent): void;
  onEvent(handler: (event: GameEvent) => void): void;
}
```

### 10.2 两种模式规划

| 模式 | 说明 | 技术方向 |
|------|------|----------|
| 局域网联机 | 同一 Wi-Fi 下直连，无需服务器 | WebRTC + 信令服务器（可选） |
| 服务器联机 | 通过官方/第三方服务器匹配 | WebSocket + 房间状态同步 |

### 10.3 状态同步策略

- **权威服务器模式**：服务器运行引擎，客户端仅转发输入并接收事件
- **帧同步替代方案**：所有客户端持有确定性引擎，仅同步随机种子与玩家输入，适合局域网

### 10.4 当前预留

在 `core/network/` 中仅放置接口定义与空实现（`LocalTransport`），保证编译通过，后续替换即可。

---

## 十一、移动端优先的 UI/UX 方案

### 11.1 设计基调

- **风格**：中式诡异 + 终焉酒馆氛围，暗色底、纸质感、血红与古铜点缀
- **字体**：标题使用书法/刻本风格字体，正文使用清晰黑体
- **动效**：卡牌翻转、骰子旋转、血墨溅开、文字逐字浮现

### 11.2 响应式断点

| 断点 | 目标设备 |
|------|----------|
| ≤480px | 小屏手机 |
| 481px~768px | 大屏手机 / 平板竖屏 |
| 769px~1024px | 平板横屏 / 小笔记本 |
| ≥1025px | 桌面端 |

### 11.3 交互适配

- 手机竖屏：玩家座位呈扇形/环形排列，主操作区在底部
- 触摸目标 ≥ 44px
- 长按查看牌详情，轻触选择，滑动出牌
- 横屏时切换到“桌面式”布局

### 11.4 性能

- 使用 CSS `transform` 与 `opacity` 做动画，启用 GPU 加速
- 减少 React 重渲染：卡牌组件使用 `memo`，Store 仅订阅必要字段
- 图片资源使用 WebP/SVG，按需加载

---

## 十二、关键算法说明

### 12.1 牌真假判定

```
若 truthPhase = '天'：
  手牌组含 地/人 任意一张 → 假
  仅含 天/道 → 真
```

### 12.2 神兽判决

- 每大回合从 6 个面中随机抽取一个未被出局的面
- 抽到“天龙”则当前主参与者死亡
- 否则存活，该面标记为出局
- 若所有非天龙面均已出局，则下一次必中天龙

### 12.3 上下家计算

```
nextIndex = (currentIndex + 1) % players.length
跳过 isDead 或 isOutOfRound 的玩家
```

---

## 十三、非功能性要求

- **可测试性**：引擎函数纯函数化，提供单元测试入口
- **可扩展性**：新增小回合类型、牌相、规则均可通过扩展状态机/Mod 实现
- **可移植性**：`core/` 可独立打包为 npm 包，供服务器或小游戏平台复用
- **可维护性**：所有状态变更必须通过 `GameAction` 描述，禁止直接修改 GameState

---

## 十四、风险与应对

| 风险 | 应对 |
|------|------|
| 规则理解歧义 | 与规则原作者确认关键边界条件，并在 RuleEngine 中集中注释 |
| AI 过于简单或作弊 | 分难度策略，暴露决策日志供玩家复盘 |
| 移动端性能不足 | 使用虚拟 DOM 优化、减少同时渲染卡牌数量、使用 CSS 动画 |
| 后续联机改造成本高 | 从一开始就采用事件驱动 + 确定性引擎 |
| Mod 破坏平衡 | 白名单机制 + 版本校验 + 联机时强制一致 |
