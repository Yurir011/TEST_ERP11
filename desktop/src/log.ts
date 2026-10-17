/**
 * 디버그 메시지 (CLAUDE.md 코딩 규칙): `[모듈] 내용` 형식. LOG_LEVEL 환경변수(debug/info/warn/error, 기본 info)로 양을 조절한다.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function threshold(): number {
  const v = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVELS[v] ?? LEVELS.info;
}

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function getLogger(module: string): Logger {
  const out = (level: Level, msg: string) => {
    if (LEVELS[level] < threshold()) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase()} [${module}] ${msg}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m) => out("debug", m),
    info: (m) => out("info", m),
    warn: (m) => out("warn", m),
    error: (m) => out("error", m),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
