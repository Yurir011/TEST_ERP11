// 버전 표기와 비교. 화면에 보이는 형식은 V.주.부(2자리).빌드(3자리) (예: V.0.07.150) 이고, 내부(package.json·서버·설치 파일 도구)에는
// 0 으로 시작하는 숫자를 인정하지 않는 도구 때문에 0.7.150 으로 둔다. 두 표기는 항상 같은 값이다.
// desktop/src/version.ts, backend/app/version.py 와 같은 규칙이다 (함께 바꾼다).

export interface AppVersion {
  major: number;
  minor: number; // 0~99
  patch: number; // 0~999 (빌드 번호)
}

/** "V.0.07.150", "v.0.07.150", "0.07.150", "0.7.150" 모두 받는다. 형식이 틀리면 null. */
export function parseVersion(text: string): AppVersion | null {
  const m = /^\s*[vV]?\.?(\d+)\.(\d{1,2})\.(\d{1,3})\s*$/.exec(text);
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

/** 화면 표기 V.0.07.150 (해석할 수 없으면 받은 값 그대로) */
export function formatVersion(text: string): string {
  const v = parseVersion(text);
  return v ? `V.${v.major}.${String(v.minor).padStart(2, "0")}.${String(v.patch).padStart(3, "0")}` : text;
}

/** candidate 가 current 보다 새 버전인가. 해석할 수 없는 값이 있으면 false (잘못된 안내가 뜨지 않게). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  return (a.major - b.major || a.minor - b.minor || a.patch - b.patch) > 0;
}

/** 두 버전이 같은 값인가 (표기가 달라도 같은 버전이면 true). 해석할 수 없으면 false. */
export function sameVersion(a: string, b: string): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return !!x && !!y && x.major === y.major && x.minor === y.minor && x.patch === y.patch;
}
