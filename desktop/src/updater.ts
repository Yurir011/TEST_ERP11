/**
 * 앱 안에서 바로 업데이트: 서버 release 폴더의 최신 설치 파일을 확인하고, 받아서 검사한 뒤 설치 프로그램을 실행한다.
 * 화면(서버 화면)은 [지금 업데이트]를 눌렀다는 신호만 보낸다. 주소·파일 이름은 화면이 정하지 못하고, 앱이 설정된 서버 주소에서만 받는다.
 *
 * 받은 파일은 (1) 이름 형식 (2) 서버가 알려 준 크기 (3) 윈도우 실행 파일 머리말(MZ) (4) 서버가 알려 준 SHA-256(있을 때)을 확인한다.
 * 서버 주소가 http 이면 전송 중 바꿔치기를 막아 주지 못하므로, 직원이 직접 누른 경우에만 실행하고 https 서버를 쓰는 것을 권장한다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type Logger, silentLogger } from "./log";
import { formatVersion, isNewer } from "./version";

export interface PublicRelease {
  version: string;
  display: string;
  filename: string;
  size: number;
  sha256?: string;
}

export const SETUP_NAME = /^BENCH-ERP_(?:Setup_(\d{1,4})\.(\d{1,4})\.(\d{1,5})|V\.(\d{1,4})\.(\d{2})\.(\d{3})_Setup)\.exe$/;
const MIN_INSTALLER_BYTES = 1024 * 1024; // 이보다 작으면 설치 파일이 아니다
const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;

export type UpdateInfo = { ok: true; latest: PublicRelease | null; current: string; newer: boolean } | { ok: false; error: string };

/** 서버가 알려 준 값을 검사해 정리한다 (이상하면 null) */
export function parsePublicRelease(v: unknown): PublicRelease | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.version !== "string" || typeof o.display !== "string" || typeof o.filename !== "string" || typeof o.size !== "number") return null;
  if (!SETUP_NAME.test(o.filename)) return null;
  if (!Number.isSafeInteger(o.size) || o.size < MIN_INSTALLER_BYTES || o.size > MAX_INSTALLER_BYTES) return null;
  const sha256 = typeof o.sha256 === "string" && /^[0-9a-f]{64}$/i.test(o.sha256) ? o.sha256.toLowerCase() : undefined;
  return { version: o.version, display: o.display, filename: o.filename, size: o.size, sha256 };
}

/** 서버에 더 새 버전이 올라와 있는지 확인한다 */
export async function checkForUpdate(serverUrl: string, current: string, fetchImpl: typeof fetch = fetch): Promise<UpdateInfo> {
  try {
    const res = await fetchImpl(`${serverUrl}/api/client/public/latest`, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!res.ok) return { ok: false, error: `서버가 오류로 응답했습니다 (HTTP ${res.status}).` };
    const latest = parsePublicRelease(await res.json());
    return { ok: true, latest, current, newer: !!latest && isNewer(latest.version, current) };
  } catch {
    return { ok: false, error: "서버에서 새 버전 정보를 받지 못했습니다." };
  }
}

export type DownloadResult = { ok: true; file: string } | { ok: false; error: string };

/**
 * 설치 파일을 받아 dir 에 저장하고 검사한다. 검사에 실패하면 받은 파일을 지운다.
 * onProgress 는 받은 비율(0~1)을 알려 준다.
 */
export async function downloadInstaller(
  serverUrl: string,
  release: PublicRelease,
  dir: string,
  onProgress: (ratio: number) => void = () => {},
  fetchImpl: typeof fetch = fetch,
  log: Logger = silentLogger,
): Promise<DownloadResult> {
  if (!SETUP_NAME.test(release.filename)) return { ok: false, error: "설치 파일 이름이 올바르지 않습니다." };
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, release.filename);
  const part = `${target}.part`;
  fs.rmSync(part, { force: true });
  try {
    const res = await fetchImpl(`${serverUrl}/api/client/public/download`, { redirect: "error" });
    if (!res.ok || !res.body) return { ok: false, error: `설치 파일을 받지 못했습니다 (HTTP ${res.status}).` };

    const hash = crypto.createHash("sha256");
    const out = fs.createWriteStream(part);
    let received = 0;
    let head = Buffer.alloc(0);
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        received += chunk.length;
        if (received > release.size) return fail(part, "받은 파일이 서버가 알려 준 크기보다 큽니다.");
        if (head.length < 2) head = Buffer.concat([head, Buffer.from(chunk.subarray(0, 2))]);
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
        onProgress(Math.min(1, received / release.size));
      }
    } finally {
      await new Promise<void>((r) => out.end(() => r()));
    }

    if (received !== release.size) return fail(part, "설치 파일을 끝까지 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    if (head.subarray(0, 2).toString("latin1") !== "MZ") return fail(part, "받은 파일이 설치 파일 형식이 아닙니다.");
    if (release.sha256 && hash.digest("hex") !== release.sha256) return fail(part, "받은 파일이 서버의 파일과 다릅니다(손상). 다시 시도해 주세요.");

    fs.rmSync(target, { force: true });
    fs.renameSync(part, target);
    log.info(`[Update] 설치 파일 받기 완료: ${release.filename} (${Math.round(received / 1024 / 1024)}MB)`);
    return { ok: true, file: target };
  } catch (err) {
    fs.rmSync(part, { force: true });
    log.warn(`[Update] 설치 파일 받기 실패: ${(err as Error).message}`);
    return { ok: false, error: "설치 파일을 받는 중 연결이 끊어졌습니다. 잠시 뒤 다시 시도해 주세요." };
  }
}

function fail(part: string, error: string): DownloadResult {
  fs.rmSync(part, { force: true });
  return { ok: false, error };
}

/**
 * 지난번 업데이트에 쓴 설치 파일 폴더를 지운다. 업데이트 직후에는 설치 프로그램이 아직 끝나지 않아 파일이 잠겨 있을 수 있으므로,
 * 지우지 못해도 예외를 내지 않고 false 를 돌려준다 (예외가 시작 과정을 끊으면 창이 없는 채로 앱이 떠 있게 된다).
 */
export function cleanupUpdateDir(dir: string, log: Logger = silentLogger): boolean {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch (err) {
    log.warn(`[Update] 지난 설치 파일을 지우지 못했습니다 (나중에 다시 시도): ${(err as Error).message}`);
    return false;
  }
}

/** 설치 프로그램을 조용히(/S) 실행하고, 끝나면 앱을 다시 켜게(--force-run) 하는 명령 인자. --updated 가 있어야 설치 프로그램이 새 앱을 "--updated" 로 켜 준다(이전 앱이 끝날 때까지 기다리고 창을 보여 줌) */
export const INSTALLER_ARGS = ["/S", "--force-run", "--updated"] as const;

export function describeUpdate(release: PublicRelease): string {
  return `${formatVersion(release.version)} (${Math.round(release.size / 1024 / 1024)}MB)`;
}
