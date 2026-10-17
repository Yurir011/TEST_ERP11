/**
 * 버전 표기와 비교. 화면에 보이는 형식은 `V.주.부(2자리).빌드(3자리)` (예: V.0.07.150) 이고,
 * npm·설치 파일 도구는 `07` 처럼 0 으로 시작하는 숫자를 버전으로 인정하지 않아서 내부(package.json 등)에는 `0.7.150` 으로 둔다.
 * 두 표기는 항상 같은 값이다: V.0.07.150 ↔ 0.7.150.
 *
 * frontend/src/lib/appVersion.ts 와 같은 규칙이다 (두 쪽을 함께 바꾼다).
 */
export interface Version {
  major: number;
  minor: number; // 0~99
  patch: number; // 0~999 (빌드 번호)
}

/** "V.0.07.150", "v0.07.150", "0.07.150", "0.7.150" 모두 받는다. 형식이 틀리면 null. */
export function parseVersion(text: string): Version | null {
  const m = /^\s*[vV]?\.?(\d+)\.(\d{1,2})\.(\d{1,3})\s*$/.exec(text);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** 내부 표기 (package.json 등): 0.7.150 */
export function toSemver(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** 화면 표기: V.0.07.150 */
export function formatVersion(v: Version | string): string {
  const parsed = typeof v === "string" ? parseVersion(v) : v;
  if (!parsed) return typeof v === "string" ? v : "";
  return `V.${parsed.major}.${String(parsed.minor).padStart(2, "0")}.${String(parsed.patch).padStart(3, "0")}`;
}

/** a 가 더 새 버전이면 양수, 같으면 0, 더 오래됐으면 음수. 해석할 수 없는 값이 있으면 null. */
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

export function isNewer(candidate: string, current: string): boolean {
  const c = compareVersions(candidate, current);
  return c !== null && c > 0;
}
