/**
 * 시스템 버전을 올린다: desktop/package.json, desktop/package-lock.json, frontend/package.json, frontend/package-lock.json,
 * backend/app/version.py 를 한 번에 바꾼다 (한 곳이라도 빠지면 backend 의 tests/test_version.py 가 실패한다).
 *
 *   cd desktop
 *   npx tsx scripts/bump-version.ts V.0.07.151        # 화면 표기, 내부 표기(0.7.151) 모두 가능
 *   npx tsx scripts/bump-version.ts V.0.07.149 --force  # 낮추거나 같은 버전으로 두려면
 *
 * 규칙 문서: docs/version-policy.md
 */
import fs from "node:fs";
import path from "node:path";

import { planBump, setJsonVersion, setPythonVersion } from "../src/release";

const root = path.join(__dirname, "..", "..");
const targets = [
  { file: path.join(root, "desktop", "package.json"), kind: "json" as const },
  { file: path.join(root, "desktop", "package-lock.json"), kind: "json" as const },
  { file: path.join(root, "frontend", "package.json"), kind: "json" as const },
  { file: path.join(root, "frontend", "package-lock.json"), kind: "json" as const },
  { file: path.join(root, "backend", "app", "version.py"), kind: "python" as const },
];

const args = process.argv.slice(2);
const force = args.includes("--force");
const input = args.find((a) => !a.startsWith("--"));
if (!input) {
  console.error("사용법: npx tsx scripts/bump-version.ts V.0.07.151 [--force]");
  process.exit(1);
}

const current = (JSON.parse(fs.readFileSync(targets[0].file, "utf-8")) as { version: string }).version;
let plan;
try {
  plan = planBump(input, current, force);
} catch (err) {
  console.error(`[버전] ${(err as Error).message}`);
  process.exit(1);
}

// 모두 바꿀 수 있는지 먼저 확인하고(하나라도 실패하면 아무것도 쓰지 않는다), 그다음 쓴다.
const updated = targets.map((t) => {
  const text = fs.readFileSync(t.file, "utf-8");
  return { ...t, text: t.kind === "json" ? setJsonVersion(text, plan.semver) : setPythonVersion(text, plan.semver) };
});
for (const u of updated) fs.writeFileSync(u.file, u.text, "utf-8");

console.log(`[버전] ${current} → ${plan.semver}  (화면 표기 ${plan.display})`);
for (const u of updated) console.log(`  - ${path.relative(root, u.file)}`);
console.log(`
다음 순서로 진행하세요.
  1. 루트의 CHANGELOG.md 맨 위에 "${plan.display}" 항목(바뀐 내용)을 적는다
  2. 테스트: backend pytest, frontend npm test, desktop npm test
  3. 커밋
  4. 설치 파일 만들기: cd desktop && npm run dist
  5. 서버에 올리기: npm run publish-release -- --notes "바뀐 내용"`);
