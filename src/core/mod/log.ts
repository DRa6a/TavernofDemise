// 模组日志系统：可控的日志级别 + 缓冲 + 订阅
//
// 目的：
// 1. 默认不再「直接 console.log」——由 mod 加载器把日志写入一个**可被 UI 读取**的环形缓冲。
// 2. 加载器初始化时可选注入一个 logger（行为完全自定义，例如「写到 console / 写到文件 / 写入 React DevTools」）。
// 3. UI 可以通过 `loader.getLogEntries()` 读取历史；通过 `loader.subscribeLog(listener)` 订阅实时日志。
// 4. 日志有级别：silent / error / warn / info / debug。loader.setLogLevel() 可动态切换。
//
// 设计原则：基座不强加任何「是否输出 console」的策略；调用方决定。
export type ModLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<ModLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/** 日志条目。 */
export interface ModLogEntry {
  /** Unix 毫秒时间戳 */
  ts: number;
  /** 日志级别 */
  level: ModLogLevel;
  /** 哪个 mod 触发的（mod 自管理日志时为 'mod:<modId>'，框架日志时为 'loader'） */
  source: string;
  /** 主消息 */
  message: string;
  /** 额外参数（已 stringify） */
  args: string[];
}

export type ModLogListener = (entry: ModLogEntry) => void;

const MAX_ENTRIES = 200;

/**
 * 默认 logger：什么都不做（silent）。
 * 调用方应通过 setLogLevel + subscribeLog 自行决定如何消费日志。
 */
export const silentLogger: (msg: string, ...args: unknown[]) => void = () => {
  /* intentionally empty */
};

/**
 * 构造一个把日志推到 console 的 logger（按 level 路由到 console.error / warn / log）。
 * 这是个工具方法，**不是**默认行为——基座默认 silent。
 */
export function createConsoleLogger(minLevel: ModLogLevel = 'info') {
  return function (level: ModLogLevel, message: string, args: unknown[]): void {
    if (LEVEL_RANK[level] > LEVEL_RANK[minLevel]) return;
    const tag = `[mod:${level}]`;
    const line = args.length > 0
      ? `${tag} ${message} ${args.map((a) => safeStringify(a)).join(' ')}`
      : `${tag} ${message}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
}

function safeStringify(v: unknown): string {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** 内部：格式化消息（含额外参数）。 */
export function formatMessage(message: string, args: unknown[]): string {
  return args.length > 0
    ? `${message} ${args.map(safeStringify).join(' ')}`
    : message;
}

/** 内部：判断是否应通过 logger 输出（按 level 过滤）。 */
export function shouldLog(currentLevel: ModLogLevel, entryLevel: ModLogLevel): boolean {
  if (currentLevel === 'silent') return false;
  return LEVEL_RANK[entryLevel] <= LEVEL_RANK[currentLevel];
}

/** 模组日志缓冲：管理 entries + 订阅者。 */
export class ModLogBuffer {
  private entries: ModLogEntry[] = [];
  private listeners = new Set<ModLogListener>();
  private level: ModLogLevel = 'info';
  private logger: (level: ModLogLevel, message: string, args: unknown[]) => void = silentLogger;

  setLevel(level: ModLogLevel): void {
    this.level = level;
  }

  getLevel(): ModLogLevel {
    return this.level;
  }

  setLogger(logger: (level: ModLogLevel, message: string, args: unknown[]) => void): void {
    this.logger = logger;
  }

  push(entry: ModLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    if (shouldLog(this.level, entry.level)) {
      this.logger(entry.level, entry.message, entry.args.map((s) => s));
    }
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        // 订阅者异常不影响其它订阅者
      }
    }
  }

  getEntries(): ModLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  subscribe(listener: ModLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
