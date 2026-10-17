/**
 * 버전 올리기·배포 스크립트(scripts/bump-version.ts, scripts/publish-release.ts)의 순수 로직.
 * 파일을 읽고 쓰는 것은 스크립트가 하고, 여기에는 글자 처리와 규칙만 둔다 (테스트 대상).
 */
import { type Version, formatVersion, parseVersion, toSemver } from "./version";

/** electron-builder 가 만드는 설치 파일 이름 (package.json 의 nsis.artifactName 과 같아야 한다) */
export function builtInstallerName(semver: string): string {
  return `BENCH-ERP_Setup_${semver}.exe`;
}

/** 서버에 올려 직원이 내려받는 설치 파일 이름: 화면 표기 버전이 들어간다 (예: BENCH-ERP_V.0.07.150_Setup.exe) */
export function publishedInstallerName(v: Version): string {
  return `BENCH-ERP_${formatVersion(v)}_Setup.exe`;
}

/**
 * package.json / package-lock.json 의 최상위 version(과 lock 의 packages[""].version)만 바꾼다.
 * 글자 그대로 바꾸므로 들여쓰기와 나머지 내용은 그대로 유지된다. 바꿀 곳을 찾지 못하면 오류.
 */
export function setJsonVersion(text: string, semver: string): string {
  let count = 0;
  // 최상위 "version" 은 파일 맨 앞쪽(첫 번째)에 있다. 의존성 이름 아래의 "version" 은 건드리지 않는다.
  const out = text.replace(/^(\s{2}"version":\s*)"[^"]*"/m, (_m, head: string) => {
    count += 1;
    return `${head}"${semver}"`;
  });
  if (count !== 1) throw new Error("최상위 version 항목을 찾지 못했습니다.");
  // package-lock.json: "packages": { "": { "name": ..., "version": ... } }
  return out.replace(/("packages":\s*\{\s*""\s*:\s*\{[^}]*?"version":\s*)"[^"]*"/, `$1"${semver}"`);
}

/** backend/app/version.py 의 APP_VERSION = "..." 줄만 바꾼다. */
export function setPythonVersion(source: string, semver: string): string {
  const re = /^APP_VERSION = "[^"]*"/m;
  if (!re.test(source)) throw new Error("APP_VERSION 줄을 찾지 못했습니다.");
  return source.replace(re, `APP_VERSION = "${semver}"`);
}

export interface BumpPlan {
  version: Version;
  semver: string;
  display: string;
}

/** 입력(V.0.07.151 등)을 해석하고 현재 버전보다 새 버전인지 확인한다. force 면 같거나 낮아도 허용한다. */
export function planBump(input: string, current: string, force = false): BumpPlan {
  const version = parseVersion(input);
  if (!version) throw new Error(`버전 형식이 올바르지 않습니다: ${input} (예: V.0.07.151)`);
  const cur = parseVersion(current);
  const semver = toSemver(version);
  if (!force && cur && toSemver(cur) === semver) throw new Error(`이미 현재 버전입니다: ${formatVersion(version)}`);
  if (!force && cur && compareParts(version, cur) < 0) {
    throw new Error(`현재 버전(${formatVersion(cur)})보다 낮습니다: ${formatVersion(version)}. 되돌리려면 --force 를 붙이세요.`);
  }
  return { version, semver, display: formatVersion(version) };
}

function compareParts(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export interface LatestJson {
  version: string; // 내부 표기 (0.7.150)
  display: string; // 화면 표기 (V.0.07.150)
  filename: string;
  size: number;
  sha256: string;
  notes: string;
  published_at: string;
}

/** 서버가 앱에게 알려 주는 최신 버전 정보 (backend/app/routers/client_app.py 가 읽는다). */
export function buildLatestJson(v: Version, size: number, sha256: string, notes: string, now: Date): LatestJson {
  return {
    version: toSemver(v),
    display: formatVersion(v),
    filename: publishedInstallerName(v),
    size,
    sha256,
    notes: notes.trim(),
    published_at: now.toISOString(),
  };
}
