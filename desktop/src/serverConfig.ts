/**
 * 서버 주소 설정: 입력 검사, 저장, 연결 확인, 그리고 IPC 를 보낸 화면이 믿을 수 있는 곳인지 판별.
 * Electron 에 의존하지 않는 순수 함수 위주라 단위 테스트가 된다 (파일 읽기·쓰기는 경로를 받아서 한다).
 */
import fs from "node:fs";
import path from "node:path";

import { type Logger, silentLogger } from "./log";

export interface AppConfig {
  serverUrl?: string; // 예: http://192.168.0.10 (origin 만 저장)
  nfcPort?: string; // 자동으로 못 찾을 때 직접 지정한 포트
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** 사용자가 입력한 서버 주소를 origin(프로토콜+호스트+포트)으로 정리한다. 스킴을 생략하면 http 로 본다. */
export function normalizeServerUrl(input: string): UrlCheck {
  const text = input.trim();
  if (!text) return { ok: false, error: "서버 주소를 입력하세요." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: "서버 주소 형식이 올바르지 않습니다. 예: http://192.168.0.10" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "http:// 또는 https:// 주소만 사용할 수 있습니다." };
  if (u.username || u.password) return { ok: false, error: "주소에 아이디/비밀번호를 넣을 수 없습니다." };
  if (!u.hostname) return { ok: false, error: "서버 주소 형식이 올바르지 않습니다." };
  return { ok: true, url: u.origin };
}

export function loadConfig(file: string, log: Logger = silentLogger): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as AppConfig;
    const cfg: AppConfig = {};
    if (typeof raw.serverUrl === "string") {
      const check = normalizeServerUrl(raw.serverUrl);
      if (check.ok) cfg.serverUrl = check.url;
    }
    if (typeof raw.nfcPort === "string" && raw.nfcPort.trim()) cfg.nfcPort = raw.nfcPort.trim();
    return cfg;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") log.warn(`[Config] 설정 파일을 읽지 못해 기본값을 씁니다: ${(err as Error).message}`);
    return {};
  }
}

export function saveConfig(file: string, cfg: AppConfig): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
  fs.renameSync(tmp, file); // 쓰다가 꺼져도 기존 파일이 깨지지 않게
}

export type HealthResult = { ok: true } | { ok: false; error: string };

/** 서버가 살아 있고 우리 서버인지 확인한다 (/api/health). */
export async function checkHealth(serverUrl: string, timeoutMs = 4000, fetchImpl: typeof fetch = fetch): Promise<HealthResult> {
  try {
    const res = await fetchImpl(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    if (!res.ok) return { ok: false, error: `서버가 오류로 응답했습니다 (HTTP ${res.status}).` };
    return { ok: true };
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, error: "서버가 응답하지 않습니다 (시간 초과)." };
    return { ok: false, error: "서버에 연결할 수 없습니다. 주소와 네트워크를 확인하세요." };
  }
}

export type SenderKind = "shell" | "server" | null;

/**
 * IPC 를 보낸 화면이 어디인지: 앱 안의 로컬 안내 화면(shell), 설정된 서버 화면(server), 그 외(null = 거절).
 * 다른 주소의 화면이 열려도 NFC·알림 기능을 쓰지 못하게 하는 기준이다.
 */
export function classifySender(senderUrl: string, serverUrl: string | undefined, shellFilePath: string): SenderKind {
  let u: URL;
  try {
    u = new URL(senderUrl);
  } catch {
    return null;
  }
  if (u.protocol === "file:") {
    const p = decodeURIComponent(u.pathname).replace(/^\/([a-z]:)/i, "$1").replace(/\//g, path.sep);
    return path.normalize(p).toLowerCase() === path.normalize(shellFilePath).toLowerCase() ? "shell" : null;
  }
  if (serverUrl && u.origin === serverUrl) return "server";
  return null;
}

/** 새 주소로 이동해도 되는지: 설정된 서버 origin 이거나 로컬 안내 화면만. */
export function isAllowedNavigation(targetUrl: string, serverUrl: string | undefined, shellFilePath: string): boolean {
  return classifySender(targetUrl, serverUrl, shellFilePath) !== null;
}
